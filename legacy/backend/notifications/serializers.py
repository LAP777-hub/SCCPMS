from rest_framework import serializers
from .models import Notification, NotificationPreference


class NotificationSerializer(serializers.ModelSerializer):
    recipient_name = serializers.CharField(source="recipient.get_full_name", read_only=True)
    
    class Meta:
        model = Notification
        fields = [
            "id",
            "recipient",
            "recipient_name",
            "notification_type",
            "title",
            "message",
            "is_read",
            "created_at",
            "related_object_id",
            "related_object_type",
        ]
        read_only_fields = ["id", "created_at"]


class NotificationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "recipient",
            "notification_type",
            "title",
            "message",
            "related_object_id",
            "related_object_type",
        ]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            "id",
            "user",
            "email_notifications",
            "in_app_notifications",
            "appointment_reminders",
            "prescription_alerts",
            "lab_result_alerts",
            "system_announcements",
        ]
        read_only_fields = ["id", "user"]


class MarkAsReadSerializer(serializers.Serializer):
    notification_id = serializers.IntegerField()
