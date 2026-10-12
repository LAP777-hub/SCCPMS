from django.db import models

from doctors.models import DoctorProfile
from patients.models import PatientProfile


class Appointment(models.Model):
    class Status(models.TextChoices):
        CONFIRMED = "CONFIRMED", "Confirmed"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    patient = models.ForeignKey(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name="appointments",
    )
    doctor = models.ForeignKey(
        DoctorProfile,
        on_delete=models.CASCADE,
        related_name="appointments",
    )
    consultation_type = models.CharField(max_length=100)
    appointment_date = models.DateField()
    appointment_time = models.TimeField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.CONFIRMED,
    )
    notes = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["appointment_date", "appointment_time"]

    def __str__(self):
        return f"{self.patient} with {self.doctor} on {self.appointment_date}"


class ScheduleEvent(models.Model):
    class Tone(models.TextChoices):
        RED = "red", "Red"
        ORANGE = "orange", "Orange"
        GOLD = "gold", "Gold"
        BLUE = "blue", "Blue"
        GREEN = "green", "Green"

    doctor = models.ForeignKey(
        DoctorProfile,
        on_delete=models.CASCADE,
        related_name="schedule_events",
    )
    event_date = models.DateField()
    event_time = models.TimeField()
    title = models.CharField(max_length=120)
    description = models.CharField(max_length=255, blank=True)
    tone = models.CharField(max_length=20, choices=Tone.choices, default=Tone.BLUE)

    class Meta:
        ordering = ["event_date", "event_time"]

    def __str__(self):
        return f"{self.title} at {self.event_time}"


class LeaveRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        DECLINED = "DECLINED", "Declined"

    doctor = models.ForeignKey(
        DoctorProfile,
        on_delete=models.CASCADE,
        related_name="leave_requests",
    )
    leave_type = models.CharField(max_length=80)
    reason = models.TextField(blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    date_applied = models.DateField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date_applied", "-created_at"]

    def __str__(self):
        return f"{self.leave_type} - {self.get_status_display()}"
