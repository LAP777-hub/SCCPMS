from django.core.mail import send_mail
from django.conf import settings
from django.template.loader import render_to_string
from .models import Notification


def send_email_notification(notification):
    subject = notification.title
    message = notification.message
    recipient_email = notification.recipient.email
    
    if recipient_email:
        try:
            send_mail(
                subject,
                message,
                settings.EMAIL_HOST_USER,
                [recipient_email],
                fail_silently=False,
            )
            return True
        except Exception as e:
            print(f"Failed to send email: {e}")
            return False
    return False


def create_notification(recipient, notification_type, title, message, related_object_id=None, related_object_type=None):
    notification = Notification.objects.create(
        recipient=recipient,
        notification_type=notification_type,
        title=title,
        message=message,
        related_object_id=related_object_id,
        related_object_type=related_object_type,
    )
    
    # Check user preferences and send email if enabled
    try:
        preference = NotificationPreference.objects.get(user=recipient)
        if preference.email_notifications:
            send_email_notification(notification)
    except NotificationPreference.DoesNotExist:
        # Create default preferences if they don't exist
        NotificationPreference.objects.create(user=recipient)
        send_email_notification(notification)
    
    return notification
