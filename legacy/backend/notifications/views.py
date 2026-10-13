from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from .models import Notification, NotificationPreference
from .serializers import (
    NotificationSerializer,
    NotificationCreateSerializer,
    NotificationPreferenceSerializer,
    MarkAsReadSerializer,
)
from .permissions import IsRecipientOrAdmin
from .services import send_email_notification


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = Notification.objects.filter(recipient=self.request.user)
        unread_only = self.request.query_params.get('unread', 'false')
        if unread_only == 'true':
            queryset = queryset.filter(is_read=False)
        return queryset


class NotificationDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated, IsRecipientOrAdmin]


class NotificationPreferenceView(generics.RetrieveUpdateAPIView):
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        preference, created = NotificationPreference.objects.get_or_create(
            user=self.request.user
        )
        return preference


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_notification_as_read(request):
    serializer = MarkAsReadSerializer(data=request.data)
    if serializer.is_valid():
        try:
            notification = Notification.objects.get(
                id=serializer.validated_data['notification_id'],
                recipient=request.user
            )
            notification.is_read = True
            notification.save()
            return Response({'status': 'marked as read'}, status=status.HTTP_200_OK)
        except Notification.DoesNotExist:
            return Response({'error': 'Notification not found'}, status=status.HTTP_404_NOT_FOUND)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_all_as_read(request):
    Notification.objects.filter(recipient=request.user, is_read=False).update(is_read=True)
    return Response({'status': 'all notifications marked as read'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_notification(request):
    if request.user.role != 'ADMIN':
        return Response({'error': 'Only admins can create notifications'}, status=status.HTTP_403_FORBIDDEN)
    
    serializer = NotificationCreateSerializer(data=request.data)
    if serializer.is_valid():
        notification = serializer.save()
        
        # Send email if recipient has email notifications enabled
        try:
            preference = NotificationPreference.objects.get(user=notification.recipient)
            if preference.email_notifications:
                send_email_notification(notification)
        except NotificationPreference.DoesNotExist:
            pass
        
        return Response(NotificationSerializer(notification).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
