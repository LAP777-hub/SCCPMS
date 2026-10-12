from rest_framework.permissions import BasePermission
from accounts.models import User


class IsAdminOrReadOnlyDoctorAccess(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.role == User.Role.ADMIN:
            return True

        if request.method in ["GET", "HEAD", "OPTIONS"]:
            return request.user.role in [
                User.Role.DOCTOR,
                User.Role.RECEPTIONIST,
                User.Role.PATIENT,
            ]

        return False

    def has_object_permission(self, request, view, obj):
        if request.user.role == User.Role.ADMIN:
            return True

        return request.method in ["GET", "HEAD", "OPTIONS"]