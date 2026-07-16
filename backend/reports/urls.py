from django.urls import path
from .views import ReportListView, ReportDetailView, generate_report, download_report

urlpatterns = [
    path("", ReportListView.as_view(), name="report-list"),
    path("<int:pk>/", ReportDetailView.as_view(), name="report-detail"),
    path("generate/", generate_report, name="generate-report"),
    path("<int:pk>/download/", download_report, name="download-report"),
]
