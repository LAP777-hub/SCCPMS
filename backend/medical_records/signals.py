from django.db.models.signals import post_save
from django.dispatch import receiver
from patients.models import PatientProfile
from .models import MedicalRecord


@receiver(post_save, sender=PatientProfile)
def create_medical_record_on_patient_creation(sender, instance, created, **kwargs):
    if created:
        MedicalRecord.objects.create(
            patient=instance,
            notes="Initial medical record created upon patient registration."
        )
