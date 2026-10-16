import { expect, test, type Page } from '@playwright/test';

const ids = { admin:'00000000-0000-4000-8000-000000000001', doctor:'00000000-0000-4000-8000-000000000002', patient:'00000000-0000-4000-8000-000000000003', receptionist:'00000000-0000-4000-8000-000000000004' };
type Role = keyof typeof ids;
function fixture() {
  const starts=new Date(Date.now()+3600000).toISOString();
  return {
    appointment:{id:'00000000-0000-4000-8000-000000000011',patient_user_id:ids.patient,patient_name:'Realtime Patient',doctor_id:'00000000-0000-4000-8000-000000000012',doctor_name:'Realtime Doctor',specialty:'General Medicine',consultation_type:'general',starts_at:starts,ends_at:new Date(Date.now()+5400000).toISOString(),mode:'in_person',status:'pending'},
    staff:[{id:ids.doctor,role:'doctor',email:'doctor.fixture@gmail.com',full_name:'Realtime Doctor',phone:'+27712345678',department:'Clinic',specialty:'General Medicine',active:true,doctor_active:true,doctor_id:'00000000-0000-4000-8000-000000000012'}],
    records:[] as Array<{id:string;email:string;full_name:string;role:string;phone:string;deleted_at:string;reinvited_user_id:string|null;reinvited_at:string|null}>,
    notifications:[] as Array<{id:string;title:string;message:string;created_at:string;read_at:null}>,
    reportTotal:0,changes:new Set<()=>void>(),writes:[] as string[],
  };
}
async function open(page:Page,role:Role,state:ReturnType<typeof fixture>) {
  let verified=false;
  const user={id:ids[role],email:`${role}.fixture@gmail.com`,app_metadata:{clinic_role:role},user_metadata:{},aud:'authenticated',role:'authenticated',email_confirmed_at:'2026-10-15T00:00:00Z',created_at:'2026-10-15T00:00:00Z'};
  const payload=Buffer.from(JSON.stringify({sub:user.id,session_id:'00000000-0000-4000-8000-000000000020',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(path.startsWith('/auth/v1/'))return route.fulfill(path.endsWith('/logout')?{status:204}:{json:path.endsWith('/user')?user:{access_token:`e30.${payload}.fixture`,refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user}});
    if(path==='/auth/profile')return route.fulfill({json:{data:{...user,role,full_name:`Realtime ${role}`}}});
    if(path==='/auth/otp/status')return route.fulfill({json:{verified}});
    if(path==='/auth/otp/send')return route.fulfill({status:202,json:{deliveryMode:'email',message:'Isolated fixture',destination:'f***@gmail.com'}});
    if(path==='/auth/otp/verify'){verified=true;return route.fulfill({json:{message:'Verified fixture'}});}
    if(path==='/api/events'){
      await new Promise<void>(resolve=>state.changes.add(resolve));
      try{return await route.fulfill({contentType:'text/event-stream',body:'data: {"changed":true,"table":"appointments"}\n\ndata: {"changed":true,"table":"notifications"}\n\n'});}catch{ return; }
    }
    if(path.startsWith('/api/')){
      if(request.method()!=='GET'){
        state.writes.push(`${request.method()} ${path}`);
        if(path.endsWith('/status')){
          state.appointment.status=request.postDataJSON().status;
          state.notifications.push({id:'notice-fixture',title:'Appointment updated',message:'Appointment confirmed by the administrator.',created_at:new Date().toISOString(),read_at:null});
        }
        if(path===`/api/staff/${ids.doctor}`){
          if(request.method()==='PATCH')state.staff[0].active=request.postDataJSON().active;
          if(request.method()==='DELETE'){
            state.records.push({id:ids.doctor,email:state.staff[0].email,full_name:'Realtime Doctor',role:'doctor',phone:'+27712345678',deleted_at:new Date().toISOString(),reinvited_user_id:null,reinvited_at:null});state.staff=[];
          }
        }
        if(path.endsWith('/reinvite')){state.records[0].reinvited_user_id='replacement-fixture';state.records[0].reinvited_at=new Date().toISOString();}
        for(const changed of state.changes)changed();state.changes.clear();
        return route.fulfill({json:{data:state.appointment}});
      }
      let data:unknown=[];
      if(path==='/api/appointments')data=[state.appointment];
      if(path==='/api/staff')data=state.staff;
      if(path==='/api/account-records')data=state.records;
      if(path==='/api/notifications')data=state.notifications;
      if(path==='/api/patients')data=[{id:ids.patient,email:'patient.fixture@gmail.com',full_name:'Realtime Patient',phone:'+27712345678',active:true,user_type:'Student'}];
      if(path==='/api/doctors')data=[{id:state.appointment.doctor_id,user_id:ids.doctor,full_name:'Realtime Doctor',specialty:'General Medicine'}];
      if(path==='/api/clinic/settings')data={timezone:'Africa/Johannesburg',opens_at:'08:00:00',closes_at:'17:00:00',default_appointment_minutes:30,minimum_reschedule_notice_hours:2};
      if(path==='/api/analytics')data={patients:1,doctors:state.staff.length,staff:state.staff.length,appointmentsToday:0,pendingAppointments:state.appointment.status==='pending'?1:0,activeWalkIns:0,clinicalVisits:0,pendingLeaveRequests:0,dailyAppointments:[]};
      if(path==='/api/reports/summary'){
        const from=url.searchParams.get('from')!,to=url.searchParams.get('to')!;
        data={from,to,timezone:'Africa/Johannesburg',appointments:state.reportTotal,completed:0,cancelled:0,no_show:0,pending:0,confirmed:0,in_progress:0,patients_seen:0,active_doctors:0,pending_leave:0,walk_ins:0,clinical_visits:0,prescriptions:0,lab_orders:0,daily_activity:[{date:from,appointments:state.reportTotal,completed:0,cancelled:0,no_show:0,walk_ins:0}],doctor_activity:[],account_counts:{admin:1,doctor:0,receptionist:0,patient:0,inactive:0,deleted:0},account_activity:[]};
      }
      return route.fulfill({json:{data}});
    }
    return url.origin==='http://127.0.0.1:5178'?route.continue():route.abort();
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:new RegExp(`^${role}`,'i')}).click();
  await page.getByLabel('Email Address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill('fixture-password-only');
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await page.getByLabel('6-Digit Code').fill('123456');await page.getByRole('button',{name:'Verify & Sign In'}).click();
  await expect(page.locator('aside nav')).toBeAttached();
}

test('admin deletes an inactive staff login, views retained contact details and invites it back from Records',async({page})=>{
  const state=fixture();await open(page,'admin',state);
  await page.locator('aside nav').getByRole('button',{name:'Doctors & Staff'}).click();
  const row=page.getByRole('row').filter({hasText:'Realtime Doctor'});
  await expect(row.getByRole('button',{name:'Delete account',exact:true})).toHaveCount(0);
  await row.getByRole('button',{name:'Deactivate',exact:true}).click();await page.getByRole('button',{name:'Deactivate account',exact:true}).click();
  await row.getByRole('button',{name:'Delete account',exact:true}).click();await page.getByRole('button',{name:'Delete permanently',exact:true}).click();
  await expect(row).toHaveCount(0);
  await page.locator('aside nav').getByRole('button',{name:'Records',exact:true}).click();await page.getByRole('button',{name:'View record'}).click();
  await expect(page.getByRole('dialog',{name:'Realtime Doctor'})).toBeVisible();
  await expect(page.getByRole('link',{name:'doctor.fixture@gmail.com'}).first()).toHaveAttribute('href','mailto:doctor.fixture@gmail.com');
  await expect(page.getByRole('link',{name:'+27712345678'}).first()).toHaveAttribute('href','tel:+27712345678');
  await page.getByRole('button',{name:'Invite back to system'}).click();await expect(page.getByRole('status')).toContainText('Invitation sent');
  expect(state.writes).toEqual([`PATCH /api/staff/${ids.doctor}`,`DELETE /api/staff/${ids.doctor}`,`POST /api/account-records/${ids.doctor}/reinvite`]);
});

test('receptionist invitations offer only Reception / Front desk while doctors retain clinical departments',async({page})=>{
  const state=fixture(); await open(page,'admin',state);
  await page.locator('aside nav').getByRole('button',{name:'Doctors & Staff'}).click();
  await page.getByRole('button',{name:'Invite receptionist',exact:true}).click();
  const modal=page.locator('.admin-modal');
  const department=modal.locator('select').first();
  await expect(department.locator('option')).toHaveCount(1);
  await expect(department).toHaveValue('Reception / Front desk');
  await modal.getByRole('button',{name:'Doctor',exact:true}).click();
  await expect(department.locator('option')).not.toHaveCount(1);
  await expect(department.locator('option[value="Reception / Front desk"]')).toHaveCount(0);
});

test('reports display real zero states and preserve unapplied date edits while live data refreshes',async({page})=>{
  const state=fixture();await open(page,'admin',state);await page.locator('aside nav').getByRole('button',{name:'Reports',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Appointment outcomes'})).toBeVisible();
  await expect(page.getByText('No appointment outcomes in this date range.')).toBeVisible();
  const originalTo=await page.getByLabel('To',{exact:true}).inputValue();await page.getByLabel('From',{exact:true}).fill('2026-01-01');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('clinic:data-changed',{detail:{table:'appointments',remote:true}})));
  await expect(page.getByLabel('From',{exact:true})).toHaveValue('2026-01-01');await expect(page.getByLabel('To',{exact:true})).toHaveValue(originalTo);
  await expect(page.getByText('Current active accounts',{exact:true})).toBeVisible();expect(state.writes).toEqual([]);
});

test('an administrator confirmation updates a doctor and patient in separate sessions through the live stream',async({browser})=>{
  const state=fixture();const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
  try {
    const [admin,doctor,patient]=await Promise.all(contexts.map(context=>context.newPage()));
    await open(admin,'admin',state);await open(doctor,'doctor',state);await open(patient,'patient',state);
    await doctor.locator('aside nav').getByRole('button',{name:'Appointments',exact:true}).click();
    await patient.locator('aside nav').getByRole('button',{name:'Notifications',exact:true}).click();
    await admin.locator('aside nav').getByRole('button',{name:'Appointments',exact:true}).click();
    await expect.poll(()=>state.changes.size).toBeGreaterThanOrEqual(3);
    await admin.getByRole('row').filter({hasText:'Realtime Patient'}).getByRole('button',{name:'Confirm',exact:true}).click();
    await expect(doctor.getByRole('row').filter({hasText:'Realtime Patient'}).getByRole('cell',{name:'confirmed',exact:true})).toBeVisible({timeout:10000});
    await expect(patient.getByText('Appointment confirmed by the administrator.',{exact:true})).toBeVisible({timeout:10000});
    expect(state.writes).toEqual([`PATCH /api/appointments/${state.appointment.id}/status`]);
  } finally { await Promise.all(contexts.map(context=>context.close())); }
});


test('mobile report plots retain readable text inside their own scroll area',async({page})=>{
  await page.setViewportSize({width:320,height:740});
  const state=fixture();state.reportTotal=4;await open(page,'admin',state);
  await page.getByRole('button',{name:'Toggle menu'}).click();
  await page.locator('aside nav').getByRole('button',{name:'Reports',exact:true}).click();
  const plot=page.getByRole('img',{name:'Daily appointment and completion counts'});
  await expect(plot).toBeVisible();
  const geometry=await plot.evaluate(element=>({width:element.getBoundingClientRect().width,font:parseFloat(getComputedStyle(element.querySelector('text')!).fontSize),overflow:document.documentElement.scrollWidth>innerWidth+1}));
  expect(geometry.width).toBeGreaterThanOrEqual(760);expect(geometry.font).toBeGreaterThanOrEqual(16);expect(geometry.overflow).toBe(false);
  await expect(page.getByRole('region',{name:'Scrollable daily appointment plot'})).toBeVisible();
});
