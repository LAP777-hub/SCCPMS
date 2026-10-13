import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import PatientList from '../components/PatientList';
import DoctorList from '../components/DoctorList';
import AppointmentList from '../components/AppointmentList';

export default function ReceptionistDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('appointments');

  return (
    <div className="bg-gray-50 min-h-screen">
      <nav className="bg-white shadow-sm">
        <div className="mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="font-bold text-gray-900 text-xl">SCCPMS - Receptionist Portal</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Welcome, {user?.first_name}</span>
              <button
                onClick={logout}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-md text-white"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
        <div className="mb-6">
          <div className="border-gray-200 border-b">
            <nav className="flex space-x-8 -mb-px">
              <button
                onClick={() => setActiveTab('appointments')}
                className={`${
                  activeTab === 'appointments'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Appointments
              </button>
              <button
                onClick={() => setActiveTab('patients')}
                className={`${
                  activeTab === 'patients'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Patients
              </button>
              <button
                onClick={() => setActiveTab('doctors')}
                className={`${
                  activeTab === 'doctors'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Doctors
              </button>
            </nav>
          </div>
        </div>

        {activeTab === 'appointments' && <AppointmentList />}
        {activeTab === 'patients' && <PatientList />}
        {activeTab === 'doctors' && <DoctorList />}
      </div>
    </div>
  );
}
