from rest_framework.permissions import BasePermission
from accounts.models import User


class IsAdminOrReceptionistOrOwnPatient(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        if request.user.role in [User.Role.ADMIN, User.Role.RECEPTIONIST]:
            return True

        if request.user.role == User.Role.PATIENT:
            return request.method in ["GET", "HEAD", "OPTIONS"]

        return False

    def has_object_permission(self, request, view, obj):
        if request.user.role in [User.Role.ADMIN, User.Role.RECEPTIONIST]:
            return True

        if request.user.role == User.Role.PATIENT:
            return obj.user == request.user and request.method in ["GET", "HEAD", "OPTIONS"]

        return False