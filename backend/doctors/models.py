from django.db import models
from accounts.models import User


class DoctorProfile(models.Model):
    class Specialization(models.TextChoices):
        GENERAL_PRACTITIONER = "GENERAL_PRACTITIONER", "General Practitioner"
        DENTIST = "DENTIST", "Dentist"
        PSYCHOLOGIST = "PSYCHOLOGIST", "Psychologist"
        PHYSIOTHERAPIST = "PHYSIOTHERAPIST", "Physiotherapist"
        NURSE = "NURSE", "Nurse"
        OTHER = "OTHER", "Other"

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="doctor_profile",
        limit_choices_to={"role": User.Role.DOCTOR},
    )

    staff_number = models.CharField(max_length=50, unique=True)
    specialization = models.CharField(
        max_length=50,
        choices=Specialization.choices,
        default=Specialization.GENERAL_PRACTITIONER,
    )

    consultation_room = models.CharField(max_length=50, blank=True, null=True)

    work_start_time = models.TimeField(default="08:00")
    work_end_time = models.TimeField(default="18:30")

    is_available = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_doctor_profiles",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Dr {self.user.get_full_name()} - {self.specialization}"