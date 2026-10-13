from rest_framework import serializers
from .models import Report


class ReportSerializer(serializers.ModelSerializer):
    generated_by_name = serializers.CharField(source="generated_by.get_full_name", read_only=True)
    
    class Meta:
        model = Report
        fields = [
            "id",
            "report_type",
            "title",
            "description",
            "parameters",
            "pdf_file",
            "generated_by",
            "generated_by_name",
            "generated_at",
        ]
        read_only_fields = ["id", "pdf_file", "generated_by", "generated_at"]


class ReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = [
            "report_type",
            "title",
            "description",
            "parameters",
        ]
    
    def create(self, validated_data):
        validated_data["generated_by"] = self.context["request"].user
        return super().create(validated_data)
