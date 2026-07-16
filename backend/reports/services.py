from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from datetime import datetime
from patients.models import PatientProfile
from appointments.models import Appointment
from doctors.models import DoctorProfile
from medical_records.models import MedicalRecord
import os


def generate_patient_statistics_report(parameters):
    from django.conf import settings
    from django.core.files.storage import default_storage
    
    # Get data
    total_patients = PatientProfile.objects.count()
    active_patients = PatientProfile.objects.filter(is_active=True).count()
    male_patients = PatientProfile.objects.filter(gender='MALE').count()
    female_patients = PatientProfile.objects.filter(gender='FEMALE').count()
    
    # Create PDF
    filename = f"patient_statistics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    filepath = os.path.join(settings.MEDIA_ROOT, 'reports', filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    doc = SimpleDocTemplate(filepath, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title = Paragraph("Patient Statistics Report", styles['Title'])
    story.append(title)
    story.append(Spacer(1, 12))
    
    # Date
    date = Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal'])
    story.append(date)
    story.append(Spacer(1, 24))
    
    # Statistics table
    data = [
        ['Metric', 'Count'],
        ['Total Patients', str(total_patients)],
        ['Active Patients', str(active_patients)],
        ['Male Patients', str(male_patients)],
        ['Female Patients', str(female_patients)],
    ]
    
    table = Table(data, colWidths=[3*inch, 2*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    story.append(table)
    
    doc.build(story)
    return f'reports/{filename}'


def generate_appointment_report(parameters):
    from django.conf import settings
    
    # Get data
    total_appointments = Appointment.objects.count()
    confirmed = Appointment.objects.filter(status='CONFIRMED').count()
    completed = Appointment.objects.filter(status='COMPLETED').count()
    cancelled = Appointment.objects.filter(status='CANCELLED').count()
    in_progress = Appointment.objects.filter(status='IN_PROGRESS').count()
    
    # Create PDF
    filename = f"appointment_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    filepath = os.path.join(settings.MEDIA_ROOT, 'reports', filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    doc = SimpleDocTemplate(filepath, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title = Paragraph("Appointment Report", styles['Title'])
    story.append(title)
    story.append(Spacer(1, 12))
    
    # Date
    date = Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal'])
    story.append(date)
    story.append(Spacer(1, 24))
    
    # Statistics table
    data = [
        ['Status', 'Count'],
        ['Total Appointments', str(total_appointments)],
        ['Confirmed', str(confirmed)],
        ['In Progress', str(in_progress)],
        ['Completed', str(completed)],
        ['Cancelled', str(cancelled)],
    ]
    
    table = Table(data, colWidths=[3*inch, 2*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    story.append(table)
    
    doc.build(story)
    return f'reports/{filename}'


def generate_doctor_performance_report(parameters):
    from django.conf import settings
    
    # Get data
    doctors = DoctorProfile.objects.all()
    doctor_data = []
    
    for doctor in doctors:
        appointment_count = doctor.appointments.count()
        completed_count = doctor.appointments.filter(status='COMPLETED').count()
        doctor_data.append([
            f"Dr. {doctor.user.get_full_name()}",
            str(appointment_count),
            str(completed_count),
            doctor.specialization,
        ])
    
    # Create PDF
    filename = f"doctor_performance_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    filepath = os.path.join(settings.MEDIA_ROOT, 'reports', filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    doc = SimpleDocTemplate(filepath, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title = Paragraph("Doctor Performance Report", styles['Title'])
    story.append(title)
    story.append(Spacer(1, 12))
    
    # Date
    date = Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal'])
    story.append(date)
    story.append(Spacer(1, 24))
    
    # Doctor performance table
    data = [['Doctor', 'Total Appointments', 'Completed', 'Specialization']]
    data.extend(doctor_data)
    
    table = Table(data, colWidths=[2.5*inch, 1.5*inch, 1.5*inch, 2*inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    story.append(table)
    
    doc.build(story)
    return f'reports/{filename}'
