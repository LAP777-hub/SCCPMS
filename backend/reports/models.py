from django.db import models
from accounts.models import User


class Report(models.Model):
    class ReportType(models.TextChoices):
        PATIENT_STATISTICS = "PATIENT_STATISTICS", "Patient Statistics"
        APPOINTMENT_REPORT = "APPOINTMENT_REPORT", "Appointment Report"
        DOCTOR_PERFORMANCE = "DOCTOR_PERFORMANCE", "Doctor Performance"
        MEDICAL_RECORDS_SUMMARY = "MEDICAL_RECORDS_SUMMARY", "Medical Records Summary"
    
    report_type = models.CharField(
        max_length=50,
        choices=ReportType.choices,
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    
    # Report parameters (stored as JSON for flexibility)
    parameters = models.JSONField(default=dict, blank=True)
    
    # File information
    pdf_file = models.FileField(upload_to="reports/", blank=True, null=True)
    
    # Metadata
    generated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name="generated_reports",
    )
    generated_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ["-generated_at"]
    
    def __str__(self):
        return f"{self.title} - {self.generated_at.strftime('%Y-%m-%d %H:%M')}"
