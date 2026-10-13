import re
from datetime import date

from rest_framework import serializers

from .models import PatientProfile


def validate_sa_phone_number(phone_number):
    if not phone_number:
        return

    if not re.fullmatch(r"0[6-8][0-9]{8}", phone_number):
        raise serializers.ValidationError(
            "Phone number must be a valid South African cellphone number, e.g. 0712345678."
        )


class PatientProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="user.get_full_name", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    phone_number = serializers.CharField(source="user.phone_number", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = PatientProfile
        fields = [
            "id",
            "user",
            "full_name",
            "username",
            "email",
            "phone_number",
            "student_number",
            "id_number",
            "date_of_birth",
            "gender",
            "address",
            "emergency_contact_name",
            "emergency_contact_phone",
            "allergies",
            "chronic_conditions",
            "is_active",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "full_name",
            "username",
            "email",
            "phone_number",
            "student_number",
            "id_number",
            "date_of_birth",
            "gender",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]

    def validate_date_of_birth(self, value):
        if value and value > date.today():
            raise serializers.ValidationError("Date of birth cannot be in the future.")

        if value:
            today = date.today()
            age = today.year - value.year - (
                (today.month, today.day) < (value.month, value.day)
            )

            if age < 16:
                raise serializers.ValidationError(
                    "Patient must be at least 16 years old."
                )

        return value

    def validate_emergency_contact_phone(self, value):
        validate_sa_phone_number(value)
        return value

    def validate(self, attrs):
        request = self.context.get("request")

        if request and request.user.role == "PATIENT":
            blocked_fields = [
                "user",
                "student_number",
                "id_number",
                "date_of_birth",
                "gender",
                "is_active",
                "created_by",
            ]

            for field in blocked_fields:
                if field in attrs:
                    raise serializers.ValidationError({
                        field: "Patients cannot update this field."
                    })

        return attrs