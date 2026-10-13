from django.urls import path
from .views import MedicalRecordListCreateView, MedicalRecordDetailView

urlpatterns = [
    path("", MedicalRecordListCreateView.as_view(), name="medical-record-list-create"),
    path("<int:pk>/", MedicalRecordDetailView.as_view(), name="medical-record-detail"),
]
