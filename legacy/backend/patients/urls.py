from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PatientProfileViewSet

router = DefaultRouter()
router.register(r"profiles", PatientProfileViewSet, basename="patient-profile")

urlpatterns = [
    path("", include(router.urls)),
]