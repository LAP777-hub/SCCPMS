from django.urls import path
from .views import (
    NotificationListView,
    NotificationDetailView,
    NotificationPreferenceView,
    mark_notification_as_read,
    mark_all_as_read,
    create_notification,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("<int:pk>/", NotificationDetailView.as_view(), name="notification-detail"),
    path("preferences/", NotificationPreferenceView.as_view(), name="notification-preferences"),
    path("mark-read/", mark_notification_as_read, name="mark-notification-read"),
    path("mark-all-read/", mark_all_as_read, name="mark-all-read"),
    path("create/", create_notification, name="create-notification"),
]
