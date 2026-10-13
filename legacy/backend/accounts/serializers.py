from datetime import datetime

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User
from patients.models import PatientProfile


def validate_sa_id_number(id_number, date_of_birth, gender):
    if not id_number:
        raise serializers.ValidationError("ID number is required.")

    if not id_number.isdigit():
        raise serializers.ValidationError("ID number must contain digits only.")

    if len(id_number) != 13:
        raise serializers.ValidationError("ID number must be exactly 13 digits.")

    dob_from_id = id_number[:6]

    if date_of_birth:
        expected_dob = date_of_birth.strftime("%y%m%d")
        if dob_from_id != expected_dob:
            raise serializers.ValidationError(
                "The first 6 digits of the ID number must match the date of birth."
            )

    try:
        datetime.strptime(dob_from_id, "%y%m%d")
    except ValueError:
        raise serializers.ValidationError("ID number contains an invalid birth date.")

    gender_digits = int(id_number[6:10])

    if gender == PatientProfile.Gender.MALE and gender_digits < 5000:
        raise serializers.ValidationError("ID number does not match selected gender.")

    if gender == PatientProfile.Gender.FEMALE and gender_digits >= 5000:
        raise serializers.ValidationError("ID number does not match selected gender.")

    digits = [int(digit) for digit in id_number]
    odd_sum = sum(digits[0:12:2])
    even_digits = "".join(str(digits[i]) for i in range(1, 12, 2))
    even_sum = sum(int(digit) for digit in str(int(even_digits) * 2))
    total = odd_sum + even_sum
    check_digit = (10 - (total % 10)) % 10

    if check_digit != digits[-1]:
        raise serializers.ValidationError("Invalid South African ID number.")


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    student_number = serializers.CharField(required=True, write_only=True)
    id_number = serializers.CharField(required=True, write_only=True)
    date_of_birth = serializers.DateField(required=True, write_only=True)
    gender = serializers.ChoiceField(
        choices=PatientProfile.Gender.choices,
        required=True,
        write_only=True,
    )
    address = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)
    emergency_contact_name = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)
    emergency_contact_phone = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)
    allergies = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)
    chronic_conditions = serializers.CharField(required=False, allow_blank=True, allow_null=True, write_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "student_number",
            "id_number",
            "date_of_birth",
            "gender",
            "address",
            "emergency_contact_name",
            "emergency_contact_phone",
            "allergies",
            "chronic_conditions",
        ]
        read_only_fields = ["id", "role"]

    def validate(self, attrs):
        student_number = attrs.get("student_number")
        id_number = attrs.get("id_number")
        date_of_birth = attrs.get("date_of_birth")
        gender = attrs.get("gender")

        validate_sa_id_number(id_number, date_of_birth, gender)

        if PatientProfile.objects.filter(student_number=student_number).exists():
            raise serializers.ValidationError({
                "student_number": "A patient profile with this student number already exists."
            })

        if PatientProfile.objects.filter(id_number=id_number).exists():
            raise serializers.ValidationError({
                "id_number": "A patient profile with this ID number already exists."
            })

        return attrs

    def create(self, validated_data):
        patient_profile_fields = {
            "student_number": validated_data.pop("student_number"),
            "id_number": validated_data.pop("id_number"),
            "date_of_birth": validated_data.pop("date_of_birth"),
            "gender": validated_data.pop("gender"),
            "address": validated_data.pop("address", None),
            "emergency_contact_name": validated_data.pop("emergency_contact_name", None),
            "emergency_contact_phone": validated_data.pop("emergency_contact_phone", None),
            "allergies": validated_data.pop("allergies", None),
            "chronic_conditions": validated_data.pop("chronic_conditions", None),
        }

        password = validated_data.pop("password")
        validated_data["role"] = User.Role.PATIENT

        user = User(**validated_data)
        user.set_password(password)
        user.save()

        PatientProfile.objects.create(
            user=user,
            **patient_profile_fields,
        )

        return user


class StaffCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.ChoiceField(
        choices=[
            (User.Role.DOCTOR, "Doctor"),
            (User.Role.RECEPTIONIST, "Receptionist"),
        ],
        required=True,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "password",
            "first_name",
            "last_name",
            "phone_number",
            "role",
        ]
        read_only_fields = ["id"]

    def create(self, validated_data):
        password = validated_data.pop("password")

        user = User(**validated_data)
        user.set_password(password)

        if user.role in [User.Role.DOCTOR, User.Role.RECEPTIONIST]:
            user.is_staff = True

        user.save()
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "role",
            "is_active",
            "is_staff",
        ]


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    role = serializers.ChoiceField(
        choices=User.Role.choices,
        write_only=True,
        required=True,
    )

    def validate(self, attrs):
        selected_role = attrs.pop("role", None)

        data = super().validate(attrs)

        if self.user.role != selected_role:
            raise serializers.ValidationError({
                "role": "Selected role does not match this account."
            })

        data["user"] = {
            "id": self.user.id,
            "username": self.user.username,
            "email": self.user.email,
            "first_name": self.user.first_name,
            "last_name": self.user.last_name,
            "phone_number": self.user.phone_number,
            "role": self.user.role,
            "is_active": self.user.is_active,
            "is_staff": self.user.is_staff,
            "is_superuser": self.user.is_superuser,
        }

        return data