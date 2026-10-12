from django.db.models import Q
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from accounts.models import User
from .models import PatientProfile
from .serializers import PatientProfileSerializer
from .permissions import IsAdminOrReceptionistOrOwnPatient


class PatientProfileViewSet(viewsets.ModelViewSet):
    serializer_class = PatientProfileSerializer
    permission_classes = [IsAdminOrReceptionistOrOwnPatient]

    def get_queryset(self):
        user = self.request.user

        if user.role in [User.Role.ADMIN, User.Role.RECEPTIONIST]:
            queryset = PatientProfile.objects.select_related("user", "created_by").all()
        elif user.role == User.Role.PATIENT:
            queryset = PatientProfile.objects.select_related("user", "created_by").filter(
                user=user,
                is_active=True,
            )
        else:
            queryset = PatientProfile.objects.none()

        search = self.request.query_params.get("search")

        if search and user.role in [User.Role.ADMIN, User.Role.RECEPTIONIST]:
            queryset = queryset.filter(
                Q(student_number__icontains=search)
                | Q(id_number__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(user__phone_number__icontains=search)
                | Q(emergency_contact_phone__icontains=search)
            )

        return queryset.order_by("-created_at")

    def perform_create(self, serializer):
        user = serializer.validated_data.get("user")

        if self.request.user.role not in [User.Role.ADMIN, User.Role.RECEPTIONIST]:
            raise PermissionDenied("Only admin or receptionists can create patient profiles.")

        if not user or user.role != User.Role.PATIENT:
            raise PermissionDenied("Patient profile must be linked to a valid patient user.")

        if PatientProfile.objects.filter(user=user).exists():
            raise PermissionDenied("This user already has a patient profile.")

        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        user = self.request.user

        if user.role == User.Role.PATIENT:
            raise PermissionDenied("Patients cannot delete their own profiles.")

        if user.role not in [User.Role.ADMIN, User.Role.RECEPTIONIST]:
            raise PermissionDenied("You do not have permission to deactivate patient profiles.")

        instance.is_active = False
        instance.save()