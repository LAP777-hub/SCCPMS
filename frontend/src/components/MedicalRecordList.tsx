import React, { useState, useEffect } from 'react';
import { medicalRecordsApi } from '../lib/api';

interface MedicalRecord {
  id: number;
  patient_name: string;
  patient_student_number: string;
  doctor_name?: string;
  blood_pressure?: string;
  heart_rate?: number;
  temperature?: number;
  weight?: number;
  height?: number;
  chief_complaint?: string;
  diagnosis?: string;
  treatment_plan?: string;
  prescriptions?: string;
  lab_results?: string;
  notes?: string;
  visit_date: string;
  follow_up_date?: string;
  created_by_name?: string;
  updated_at: string;
}

export default function MedicalRecordList() {
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      const data = await medicalRecordsApi.list();
      setRecords(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load medical records');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading medical records...</div>;
  }

  if (error) {
    return <div className="text-red-600 text-center py-8">{error}</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b flex justify-between items-center">
        <h2 className="text-xl font-semibold">Medical Records</h2>
        <button className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700">
          Create Record
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Patient
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Doctor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Visit Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Diagnosis
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {records.map((record) => (
              <tr key={record.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {record.patient_name}
                  </div>
                  <div className="text-sm text-gray-500">{record.patient_student_number}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {record.doctor_name || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(record.visit_date).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                  {record.diagnosis || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button className="text-indigo-600 hover:text-indigo-900 mr-3">View</button>
                  <button className="text-indigo-600 hover:text-indigo-900 mr-3">Edit</button>
                  <button className="text-red-600 hover:text-red-900">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
