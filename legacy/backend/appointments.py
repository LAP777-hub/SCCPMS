from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from doctors.models import DoctorProfile
from patients.models import PatientProfile
from .models import Appointment, LeaveRequest, ScheduleEvent
from .serializers import (
    AppointmentSerializer,
    LeaveRequestSerializer,
    ScheduleEventSerializer,
)


def get_doctor_profile(user):
    if user.role != User.Role.DOCTOR:
        return None

    profile, _ = DoctorProfile.objects.get_or_create(
        user=user,
        defaults={
            "staff_number": f"DR-{user.id:05d}",
            "specialization": DoctorProfile.Specialization.GENERAL_PRACTITIONER,
            "consultation_room": "Clinic Room 1",
        },
    )
    return profile


def can_manage_clinic(user):
    return user.role in [User.Role.ADMIN, User.Role.RECEPTIONIST]


class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Appointment.objects.select_related("patient__user", "doctor__user")

        if can_manage_clinic(user):
            pass
        elif user.role == User.Role.DOCTOR:
            queryset = queryset.filter(doctor=get_doctor_profile(user))
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
                | Q(consultation_type__icontains=search)
            )

        appointment_date = self.request.query_params.get("date")
        if appointment_date:
            queryset = queryset.filter(appointment_date=appointment_date)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user

        if user.role == User.Role.DOCTOR:
            serializer.save(doctor=get_doctor_profile(user))
            return

        if not can_manage_clinic(user):
            raise PermissionDenied("Only clinic staff can create appointments.")

        serializer.save()

    @action(detail=True, methods=["post"])
    def status(self, request, pk=None):
        appointment = self.get_object()
        next_status = request.data.get("status")

        if next_status not in Appointment.Status.values:
            return Response(
                {"status": "Invalid appointment status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        appointment.status = next_status
        appointment.save(update_fields=["status", "updated_at"])
        return Response(self.get_serializer(appointment).data)


class ScheduleEventViewSet(viewsets.ModelViewSet):
    serializer_class = ScheduleEventSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = ScheduleEvent.objects.select_related("doctor__user")

        if can_manage_clinic(user):
            pass
        elif user.role == User.Role.DOCTOR:
            queryset = queryset.filter(doctor=get_doctor_profile(user))
        else:
            queryset = queryset.none()

        event_date = self.request.query_params.get("date")
        if event_date:
            queryset = queryset.filter(event_date=event_date)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user

        if user.role == User.Role.DOCTOR:
            serializer.save(doctor=get_doctor_profile(user))
            return

        if not can_manage_clinic(user):
            raise PermissionDenied("Only clinic staff can update schedules.")

        serializer.save()


class LeaveRequestViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveRequestSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = LeaveRequest.objects.select_related("doctor__user")

        if can_manage_clinic(user):
            return queryset

        if user.role == User.Role.DOCTOR:
            return queryset.filter(doctor=get_doctor_profile(user))

        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user

        if user.role != User.Role.DOCTOR:
            raise PermissionDenied("Only doctors can apply for leave.")

        serializer.save(doctor=get_doctor_profile(user))

    @action(detail=True, methods=["post"])
    def decision(self, request, pk=None):
        if not can_manage_clinic(request.user):
            raise PermissionDenied("Only admin or receptionists can review leave requests.")

        leave_request = self.get_object()
        next_status = request.data.get("status")

        if next_status not in LeaveRequest.Status.values:
            return Response(
                {"status": "Invalid leave status."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        leave_request.status = next_status
        leave_request.save(update_fields=["status"])
        return Response(self.get_serializer(leave_request).data)


class DoctorDashboardView(APIView):
    def get(self, request):
        today = timezone.localdate()
        user = request.user

        if user.role == User.Role.DOCTOR:
            doctor = get_doctor_profile(user)
            appointments = Appointment.objects.filter(doctor=doctor, appointment_date=today)
            schedule = ScheduleEvent.objects.filter(doctor=doctor, event_date=today)
            leave_requests = LeaveRequest.objects.filter(doctor=doctor)
            doctor_payload = {
                "id": doctor.id,
                "name": doctor.user.get_full_name() or doctor.user.username,
                "role": user.role,
                "is_available": doctor.is_available,
                "work_end_time": doctor.work_end_time,
            }
        elif can_manage_clinic(user):
            appointments = Appointment.objects.filter(appointment_date=today)
            schedule = ScheduleEvent.objects.filter(event_date=today)
            leave_requests = LeaveRequest.objects.all()
            doctor_payload = {
                "id": None,
                "name": user.get_full_name() or user.username,
                "role": user.role,
                "is_available": True,
                "work_end_time": None,
            }
        elif user.role == User.Role.PATIENT:
            patient = PatientProfile.objects.filter(user=user).first()
            appointments = Appointment.objects.filter(patient=patient, appointment_date=today)
            schedule = ScheduleEvent.objects.none()
            leave_requests = LeaveRequest.objects.none()
            doctor_payload = {
                "id": None,
                "name": user.get_full_name() or user.username,
                "role": user.role,
                "is_available": False,
                "work_end_time": None,
            }
        else:
            appointments = Appointment.objects.none()
            schedule = ScheduleEvent.objects.none()
            leave_requests = LeaveRequest.objects.none()
            doctor_payload = {"id": None, "name": user.username, "role": user.role}

        tomorrow = today + timedelta(days=1)
        yesterday = today - timedelta(days=1)
        completed_today = appointments.filter(status=Appointment.Status.COMPLETED).count()
        appointments_yesterday = Appointment.objects.filter(appointment_date=yesterday).count()
        upcoming = appointments.filter(appointment_time__gte=timezone.localtime().time()).exclude(
            status__in=[Appointment.Status.COMPLETED, Appointment.Status.CANCELLED]
        )

        payload = {
            "date": today,
            "doctor": doctor_payload,
            "metrics": {
                "appointments_today": appointments.count(),
                "appointments_yesterday": appointments_yesterday,
                "in_progress": appointments.filter(status=Appointment.Status.IN_PROGRESS).count(),
                "completed_today": completed_today,
                "leave_pending": leave_requests.filter(status=LeaveRequest.Status.PENDING).count(),
            },
            "appointments": AppointmentSerializer(
                appointments.select_related("patient__user", "doctor__user"),
                many=True,
            ).data,
            "schedule": ScheduleEventSerializer(schedule, many=True).data,
            "leave_requests": LeaveRequestSerializer(leave_requests[:5], many=True).data,
            "queue": AppointmentSerializer(
                upcoming.filter(appointment_date__lt=tomorrow).select_related(
                    "patient__user",
                    "doctor__user",
                )[:6],
                many=True,
            ).data,
        }

        return Response(payload)
