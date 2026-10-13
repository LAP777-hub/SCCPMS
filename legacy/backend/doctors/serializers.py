from rest_framework import serializers

from .models import DoctorProfile


class DoctorProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="user.get_full_name", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    phone_number = serializers.CharField(source="user.phone_number", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = DoctorProfile
        fields = [
            "id",
            "user",
            "full_name",
            "username",
            "email",
            "phone_number",
            "staff_number",
            "specialization",
            "consultation_room",
            "work_start_time",
            "work_end_time",
            "is_available",
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
            "work_start_time",
            "work_end_time",
            "created_by",
            "created_by_username",
            "created_at",
            "updated_at",
        ]