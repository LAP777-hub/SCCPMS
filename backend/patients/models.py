from django.db import models
from accounts.models import User


class PatientProfile(models.Model):
    class Gender(models.TextChoices):
        MALE = "MALE", "Male"
        FEMALE = "FEMALE", "Female"
        OTHER = "OTHER", "Other"

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="patient_profile",
        limit_choices_to={"role": User.Role.PATIENT},
    )

    student_number = models.CharField(max_length=50, unique=True)
    id_number = models.CharField(max_length=20, unique=True, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=10, choices=Gender.choices)

    address = models.TextField(blank=True, null=True)
    emergency_contact_name = models.CharField(max_length=100, blank=True, null=True)
    emergency_contact_phone = models.CharField(max_length=20, blank=True, null=True)

    allergies = models.TextField(blank=True, null=True)
    chronic_conditions = models.TextField(blank=True, null=True)

    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_patient_profiles",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.student_number}"