from django.apps import AppConfig


class MedicalRecordsConfig(AppConfig):
    name = 'medical_records'
    
    def ready(self):
        import medical_records.signals
