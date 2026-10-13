from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.http import HttpResponse
from .models import Report
from .serializers import ReportSerializer, ReportCreateSerializer
from .permissions import IsAdminOrReadOnly
from .services import generate_patient_statistics_report, generate_appointment_report, generate_doctor_performance_report


class ReportListView(generics.ListCreateAPIView):
    queryset = Report.objects.all()
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.request.method == "POST":
            return ReportCreateSerializer
        return ReportSerializer
    
    def get_queryset(self):
        user = self.request.user
        if user.role != "ADMIN":
            return Report.objects.filter(generated_by=user)
        return super().get_queryset()


class ReportDetailView(generics.RetrieveDestroyAPIView):
    queryset = Report.objects.all()
    serializer_class = ReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_report(request):
    if request.user.role != 'ADMIN':
        return Response({'error': 'Only admins can generate reports'}, status=status.HTTP_403_FORBIDDEN)
    
    report_type = request.data.get('report_type')
    title = request.data.get('title', 'Generated Report')
    description = request.data.get('description', '')
    parameters = request.data.get('parameters', {})
    
    try:
        if report_type == 'PATIENT_STATISTICS':
            pdf_path = generate_patient_statistics_report(parameters)
        elif report_type == 'APPOINTMENT_REPORT':
            pdf_path = generate_appointment_report(parameters)
        elif report_type == 'DOCTOR_PERFORMANCE':
            pdf_path = generate_doctor_performance_report(parameters)
        else:
            return Response({'error': 'Invalid report type'}, status=status.HTTP_400_BAD_REQUEST)
        
        report = Report.objects.create(
            report_type=report_type,
            title=title,
            description=description,
            parameters=parameters,
            pdf_file=pdf_path,
            generated_by=request.user,
        )
        
        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)
    
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def download_report(request, pk):
    try:
        report = Report.objects.get(pk=pk)
        if request.user.role != 'ADMIN' and report.generated_by != request.user:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        if report.pdf_file:
            response = HttpResponse(report.pdf_file.read(), content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{report.title}.pdf"'
            return response
        else:
            return Response({'error': 'PDF file not found'}, status=status.HTTP_404_NOT_FOUND)
    
    except Report.DoesNotExist:
        return Response({'error': 'Report not found'}, status=status.HTTP_404_NOT_FOUND)
