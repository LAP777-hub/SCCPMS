from django.db import models
from accounts.models import User


class Notification(models.Model):
    class Type(models.TextChoices):
        APPOINTMENT = "APPOINTMENT", "Appointment"
        PRESCRIPTION = "PRESCRIPTION", "Prescription"
        LAB_RESULT = "LAB_RESULT", "Lab Result"
        SYSTEM = "SYSTEM", "System"
        MEDICAL_RECORD = "MEDICAL_RECORD", "Medical Record"
    
    recipient = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(
        max_length=20,
        choices=Type.choices,
        default=Type.SYSTEM,
    )
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # Optional link to related object
    related_object_id = models.PositiveIntegerField(blank=True, null=True)
    related_object_type = models.CharField(max_length=50, blank=True, null=True)
    
    class Meta:
        ordering = ["-created_at"]
    
    def __str__(self):
        return f"{self.title} - {self.recipient.username}"


class NotificationPreference(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    email_notifications = models.BooleanField(default=True)
    in_app_notifications = models.BooleanField(default=True)
    appointment_reminders = models.BooleanField(default=True)
    prescription_alerts = models.BooleanField(default=True)
    lab_result_alerts = models.BooleanField(default=True)
    system_announcements = models.BooleanField(default=True)
    
    def __str__(self):
        return f"Preferences for {self.user.username}"
