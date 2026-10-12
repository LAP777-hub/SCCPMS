from django.db.models.signals import post_save
from django.dispatch import receiver
from accounts.models import User
from .models import NotificationPreference


@receiver(post_save, sender=User)
def create_notification_preferences(sender, instance, created, **kwargs):
    if created:
        NotificationPreference.objects.create(user=instance)
