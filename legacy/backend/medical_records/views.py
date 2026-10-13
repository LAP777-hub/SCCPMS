from rest_framework import generics, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from .models import MedicalRecord
from .serializers import MedicalRecordSerializer, MedicalRecordCreateSerializer
from .permissions import IsDoctorOrAdminOrReadOnly, IsDoctorOrAdmin


class MedicalRecordListCreateView(generics.ListCreateAPIView):
    queryset = MedicalRecord.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["patient", "doctor"]
    search_fields = ["patient__user__first_name", "patient__user__last_name", "patient__student_number", "diagnosis"]
    ordering_fields = ["visit_date", "updated_at"]
    ordering = ["-visit_date"]
    
    def get_serializer_class(self):
        if self.request.method == "POST":
            return MedicalRecordCreateSerializer
        return MedicalRecordSerializer
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        if user.role == "PATIENT":
            queryset = queryset.filter(patient__user=user)
        elif user.role == "DOCTOR":
            queryset = queryset.filter(doctor__user=user)
        
        return queryset


class MedicalRecordDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = MedicalRecord.objects.all()
    serializer_class = MedicalRecordSerializer
    permission_classes = [IsAuthenticated, IsDoctorOrAdminOrReadOnly]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        
        if user.role == "PATIENT":
            queryset = queryset.filter(patient__user=user)
        elif user.role == "DOCTOR":
            queryset = queryset.filter(doctor__user=user)
        
        return queryset
