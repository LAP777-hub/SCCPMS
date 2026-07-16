from rest_framework import serializers

from .models import Appointment, LeaveRequest, ScheduleEvent


class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.user.get_full_name", read_only=True)
    patient_email = serializers.EmailField(source="patient.user.email", read_only=True)
    doctor_name = serializers.CharField(source="doctor.user.get_full_name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = Appointment
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_email",
            "doctor",
            "doctor_name",
            "consultation_type",
            "appointment_date",
            "appointment_time",
            "status",
            "status_label",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]
        extra_kwargs = {
            "doctor": {"required": False},
        }


class ScheduleEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduleEvent
        fields = [
            "id",
            "doctor",
            "event_date",
            "event_time",
            "title",
            "description",
            "tone",
        ]
        extra_kwargs = {
            "doctor": {"required": False},
        }


class LeaveRequestSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source="doctor.user.get_full_name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            "id",
            "doctor",
            "doctor_name",
            "leave_type",
            "reason",
            "start_date",
            "end_date",
            "status",
            "status_label",
            "date_applied",
            "created_at",
        ]
        read_only_fields = ["status", "date_applied", "created_at"]
        extra_kwargs = {
            "doctor": {"required": False},
        }
