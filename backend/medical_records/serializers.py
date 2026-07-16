from rest_framework import serializers
from .models import MedicalRecord
from patients.models import PatientProfile
from doctors.models import DoctorProfile


class MedicalRecordSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.user.get_full_name", read_only=True)
    patient_student_number = serializers.CharField(source="patient.student_number", read_only=True)
    doctor_name = serializers.CharField(source="doctor.user.get_full_name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True)
    
    class Meta:
        model = MedicalRecord
        fields = [
            "id",
            "patient",
            "patient_name",
            "patient_student_number",
            "doctor",
            "doctor_name",
            "blood_pressure",
            "heart_rate",
            "temperature",
            "weight",
            "height",
            "chief_complaint",
            "diagnosis",
            "treatment_plan",
            "prescriptions",
            "lab_results",
            "notes",
            "visit_date",
            "follow_up_date",
            "created_by",
            "created_by_name",
            "updated_at",
        ]
        read_only_fields = ["id", "visit_date", "created_by", "updated_at"]


class MedicalRecordCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicalRecord
        fields = [
            "patient",
            "doctor",
            "blood_pressure",
            "heart_rate",
            "temperature",
            "weight",
            "height",
            "chief_complaint",
            "diagnosis",
            "treatment_plan",
            "prescriptions",
            "lab_results",
            "notes",
            "follow_up_date",
        ]
    
    def create(self, validated_data):
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)
