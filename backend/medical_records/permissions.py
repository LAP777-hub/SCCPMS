from rest_framework import permissions
from accounts.models import User


class IsDoctorOrAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated
    
    def has_object_permission(self, request, view, obj):
        if request.user.role in [User.Role.ADMIN, User.Role.DOCTOR]:
            return True
        if obj.patient.user == request.user:
            return request.method in permissions.SAFE_METHODS
        return False


class IsDoctorOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated and request.user.role in [User.Role.ADMIN, User.Role.DOCTOR]
