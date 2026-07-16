from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from accounts.models import User
from .models import DoctorProfile
from .permissions import IsAdminOrReadOnlyDoctorAccess
from .serializers import DoctorProfileSerializer


class DoctorProfileViewSet(viewsets.ModelViewSet):
    serializer_class = DoctorProfileSerializer
    permission_classes = [IsAdminOrReadOnlyDoctorAccess]

    def get_queryset(self):
        queryset = DoctorProfile.objects.select_related("user", "created_by")

        search = self.request.query_params.get("search")
        specialization = self.request.query_params.get("specialization")
        available = self.request.query_params.get("available")

        if search:
            queryset = queryset.filter(
                Q(staff_number__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__phone_number__icontains=search)
                | Q(consultation_room__icontains=search)
            )

        if specialization:
            queryset = queryset.filter(specialization=specialization)

        if available == "true":
            queryset = queryset.filter(is_available=True, is_active=True)

        return queryset.order_by("-created_at")

    @action(detail=False, methods=["get"], url_path="available")
    def available_doctors(self, request):
        queryset = self.get_queryset().filter(
            is_active=True,
            is_available=True,
        )

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        doctor_user = serializer.validated_data.get("user")

        if self.request.user.role != User.Role.ADMIN:
            raise PermissionDenied("Only admin can create doctor profiles.")

        if not doctor_user or doctor_user.role != User.Role.DOCTOR:
            raise PermissionDenied("Doctor profile must be linked to a valid doctor user.")

        if DoctorProfile.objects.filter(user=doctor_user).exists():
            raise PermissionDenied("This user already has a doctor profile.")

        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        if self.request.user.role != User.Role.ADMIN:
            raise PermissionDenied("Only admin can deactivate doctor profiles.")

        instance.is_active = False
        instance.is_available = False
        instance.save()