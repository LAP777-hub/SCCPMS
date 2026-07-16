from django.db import models
from patients.models import PatientProfile
from doctors.models import DoctorProfile
from accounts.models import User


class MedicalRecord(models.Model):
    patient = models.ForeignKey(
        PatientProfile,
        on_delete=models.CASCADE,
        related_name="medical_records",
    )
    doctor = models.ForeignKey(
        DoctorProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="medical_records",
    )
    
    # Vital Signs
    blood_pressure = models.CharField(max_length=20, blank=True, null=True)
    heart_rate = models.IntegerField(blank=True, null=True)
    temperature = models.DecimalField(max_digits=4, decimal_places=1, blank=True, null=True)
    weight = models.DecimalField(max_digits=5, decimal_places=1, blank=True, null=True)
    height = models.DecimalField(max_digits=5, decimal_places=1, blank=True, null=True)
    
    # Medical Information
    chief_complaint = models.TextField(blank=True, null=True)
    diagnosis = models.TextField(blank=True, null=True)
    treatment_plan = models.TextField(blank=True, null=True)
    prescriptions = models.TextField(blank=True, null=True)
    lab_results = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    
    # Visit Information
    visit_date = models.DateTimeField(auto_now_add=True)
    follow_up_date = models.DateField(blank=True, null=True)
    
    # Metadata
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_medical_records",
    )
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ["-visit_date"]
    
    def __str__(self):
        return f"Medical Record for {self.patient} - {self.visit_date.strftime('%Y-%m-%d')}"
