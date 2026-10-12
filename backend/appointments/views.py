from django.db.models import Q
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied

from accounts.models import User
from .models import Appointment
from .serializers import AppointmentSerializer


class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer

    def get_queryset(self):
        user = self.request.user

        queryset = Appointment.objects.select_related(
            "patient__user",
            "doctor__user",
        )

        if user.role in [User.Role.ADMIN, User.Role.RECEPTIONIST]:
            pass
        elif user.role == User.Role.DOCTOR:
            queryset = queryset.filter(doctor__user=user)
        elif user.role == User.Role.PATIENT:
            queryset = queryset.filter(patient__user=user)
        else:
            queryset = queryset.none()

        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(patient__user__first_name__icontains=search)
                | Q(patient__user__last_name__icontains=search)
                | Q(patient__student_number__icontains=search)
                | Q(doctor__user__first_name__icontains=search)
                | Q(doctor__user__last_name__icontains=search)
                | Q(consultation_type__icontains=search)
            )

        appointment_date = self.request.query_params.get("date")
        if appointment_date:
            queryset = queryset.filter(appointment_date=appointment_date)

        return queryset.order_by("appointment_date", "appointment_time")

    def perform_create(self, serializer):
        user = self.request.user

        if user.role == User.Role.PATIENT:
            serializer.save(patient=user.patient_profile)
            return

        if user.role not in [User.Role.ADMIN, User.Role.RECEPTIONIST]:
            raise PermissionDenied("Only patients, admin, or receptionists can create appointments.")

        serializer.save()

    def perform_destroy(self, instance):
        if self.request.user.role not in [User.Role.ADMIN, User.Role.RECEPTIONIST]:
            raise PermissionDenied("Only admin or receptionists can cancel appointments.")

        instance.status = Appointment.Status.CANCELLED
        instance.save()