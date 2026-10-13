from django.contrib import admin

from .models import Appointment, LeaveRequest, ScheduleEvent


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = (
        "patient",
        "doctor",
        "consultation_type",
        "appointment_date",
        "appointment_time",
        "status",
    )
    list_filter = ("status", "appointment_date", "doctor")
    search_fields = (
        "patient__user__first_name",
        "patient__user__last_name",
        "patient__student_number",
        "consultation_type",
    )


@admin.register(ScheduleEvent)
class ScheduleEventAdmin(admin.ModelAdmin):
    list_display = ("title", "doctor", "event_date", "event_time", "tone")
    list_filter = ("event_date", "doctor", "tone")


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ("leave_type", "doctor", "start_date", "end_date", "status", "date_applied")
    list_filter = ("status", "date_applied", "doctor")
