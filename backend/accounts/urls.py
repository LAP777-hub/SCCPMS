from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView,
    StaffCreateView,
    MeView,
    CustomTokenObtainPairView,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),

    path(
        "staff/create/",
        StaffCreateView.as_view(),
        name="staff-create",
    ),

    path("login/", CustomTokenObtainPairView.as_view(), name="login"),
    path("refresh/", TokenRefreshView.as_view(), name="refresh"),
    path("me/", MeView.as_view(), name="me"),
]