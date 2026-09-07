const { getDb } = require('../db/database');
const { computePriority } = require('../utils/agents/incidentAgent');
const { recommendVenues } = require('../utils/agents/venueAgent');
const { recommendSpeakers } = require('../utils/agents/speakerAgent');
const { getDashboard: getSponsorDashboard } = require('../utils/agents/sponsorshipAgent');

function getEventIntelligence(req, res) {
  const db = getDb();
  const { eventId } = req.params;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return res.status(404).json({ error: 'event not found' });

  const attendees = db.prepare('SELECT * FROM attendees WHERE event_id = ?').all(eventId);
  const sessions = db.prepare('SELECT * FROM sessions WHERE event_id = ?').all(eventId);
  const incidents = db.prepare('SELECT * FROM incidents WHERE event_id = ?').all(eventId);
  const venues = db.prepare('SELECT * FROM venues').all();
  const speakers = db.prepare('SELECT * FROM speakers').all();
  const sponsors = db.prepare('SELECT * FROM sponsors').all();

  const checkedIn = attendees.filter(a => a.checked_in).length;
  const openIncidents = incidents.filter(i => ['open','in_progress','escalated'].includes(i.status));
  const critical = incidents.filter(i => i.is_critical_alert && ['open','in_progress','escalated'].includes(i.status));
  const conflicts = [];
  const seenVenues = new Map(), seenSpeakers = new Map();
  sessions.forEach(s => {
    if (s.venue_id) { const key=`${s.venue_id}|${s.date}|${s.start_time}|${s.end_time}`; if (seenVenues.has(key)) conflicts.push(`Venue conflict detected for session ${s.topic}.`); seenVenues.set(key,true); }
    if (s.speaker_id) { const key=`${s.speaker_id}|${s.date}|${s.start_time}|${s.end_time}`; if (seenSpeakers.has(key)) conflicts.push(`Speaker conflict detected for session ${s.topic}.`); seenSpeakers.set(key,true); }
  });

  const health = Math.max(0, Math.min(100,
    100 - critical.length*20 - Math.max(0, openIncidents.length-critical.length)*8 - conflicts.length*10
  ));
  const recommendations=[];
  if (event.registration_open === 0) recommendations.push('Registrations are stopped. Reopen them only if the event should accept new attendees.');
  if (attendees.length && checkedIn / attendees.length < 0.5) recommendations.push(`Check-in is at ${Math.round(checkedIn/attendees.length*100)}%; prepare reminders and registration-desk support.`);
  if (openIncidents.length) recommendations.push(`${openIncidents.length} incident(s) remain open; prioritize critical and high-severity cases.`);
  if (sessions.length === 0) recommendations.push('No sessions are scheduled yet. Add sessions and assign available speakers and venues.');
  if (conflicts.length) recommendations.push('Resolve scheduling conflicts before the event starts.');
  if (!recommendations.length) recommendations.push('Event data looks healthy. Continue monitoring registrations, check-in, sessions and incidents.');

  const incidentRows = incidents.map(i => { const x={...i}; if (['open','in_progress'].includes(x.status)) { const p=computePriority(x); x.priority=p.priority; x.urgency_score=p.urgencyScore; } return x; });

  res.json({
    event: { id:event.id,name:event.name,date:event.date,venue:event.venue,code:event.code,registration_open:event.registration_open },
    health,
    metrics: { attendees:attendees.length, checkedIn, checkInRate:attendees.length?Math.round(checkedIn/attendees.length*100):0, sessions:sessions.length, incidents:incidents.length, openIncidents:openIncidents.length, criticalAlerts:critical.length, venues:venues.length, speakers:speakers.length, sponsors:sponsors.length },
    dataSources: { attendeeData:attendees.length, sessionData:sessions.length, incidentData:incidents.length, venuePool:venues.length, speakerPool:speakers.length, sponsorPool:sponsors.length },
    risks: [...critical.map(i=>i.alert_reason||i.description), ...conflicts],
    recommendations,
    incidents: incidentRows.slice(0,8),
  });
}

async function orchestrateAgents(req, res) {
  const db=getDb(); const {eventId}=req.params;
  const event=db.prepare('SELECT * FROM events WHERE id=?').get(eventId);
  if(!event) return res.status(404).json({error:'event not found'});
  const out=[];
  try { const r=recommendVenues(eventId,{expectedAttendees:db.prepare('SELECT COUNT(*) c FROM attendees WHERE event_id=?').get(eventId).c}); out.push({agent:'Venue Agent',status:'completed',resultCount:Array.isArray(r)?r.length:0}); } catch(e){out.push({agent:'Venue Agent',status:'error',message:e.message});}
  try { const r=recommendSpeakers(eventId,{topic:'',language:'English',budget:0,date:event.date,startTime:'00:00',endTime:'23:59'}); out.push({agent:'Speaker Agent',status:'completed',resultCount:Array.isArray(r)?r.length:0}); } catch(e){out.push({agent:'Speaker Agent',status:'error',message:e.message});}
  try { const r=getSponsorDashboard(eventId); out.push({agent:'Sponsorship Agent',status:'completed',resultCount:Array.isArray(r)?r.length:(r?.length||0)}); } catch(e){out.push({agent:'Sponsorship Agent',status:'error',message:e.message});}
  const incidents=db.prepare('SELECT * FROM incidents WHERE event_id=?').all(eventId);
  out.push({agent:'Incident Agent',status:'completed',resultCount:incidents.length,critical:incidents.filter(i=>i.is_critical_alert).length});
  res.json({event:{id:event.id,name:event.name},orchestratedAt:new Date().toISOString(),agents:out,message:'All available event agents were evaluated using the current event data.'});
}

function getExecutiveDashboard(req,res){
  const db=getDb();
  const events=db.prepare('SELECT * FROM events ORDER BY date ASC').all();
  const attendees=db.prepare('SELECT * FROM attendees').all();
  const sessions=db.prepare('SELECT * FROM sessions').all();
  const incidents=db.prepare('SELECT * FROM incidents').all();
  const sponsors=db.prepare('SELECT * FROM sponsors').all();
  const checkedIn=attendees.filter(a=>a.checked_in).length;
  const openIncidents=incidents.filter(i=>['open','in_progress','escalated'].includes(i.status)).length;
  const critical=incidents.filter(i=>i.is_critical_alert && ['open','in_progress','escalated'].includes(i.status)).length;
  const contribution=sponsors.reduce((s,x)=>s+Number(x.contribution_amount||0),0);
  const byEvent=events.map(e=>{const a=attendees.filter(x=>x.event_id===e.id), c=a.filter(x=>x.checked_in).length, inc=incidents.filter(x=>x.event_id===e.id && ['open','in_progress','escalated'].includes(x.status)).length; return {id:e.id,name:e.name,date:e.date,registrationOpen:e.registration_open,totalAttendees:a.length,checkedIn:c,checkInRate:a.length?Math.round(c/a.length*100):0,sessions:sessions.filter(x=>x.event_id===e.id).length,openIncidents:inc};});
  const recommendations=[];
  if(critical) recommendations.push(`${critical} critical incident alert(s) require immediate attention.`);
  if(openIncidents) recommendations.push(`${openIncidents} operational incident(s) are still open across the event portfolio.`);
  const closed=events.filter(e=>e.registration_open===0).length;
  if(closed) recommendations.push(`${closed} event(s) currently have registrations stopped.`);
  if(!recommendations.length) recommendations.push('Portfolio health is stable based on the current operational data.');
  res.json({generatedAt:new Date().toISOString(),kpis:{events:events.length,totalRegistrations:attendees.length,totalCheckIns:checkedIn,overallCheckInRate:attendees.length?Math.round(checkedIn/attendees.length*100):0,sessions:sessions.length,openIncidents,criticalAlerts:critical,sponsors:sponsors.length,totalSponsorship:Math.round(contribution*100)/100},events:byEvent,recommendations});
}

module.exports={getEventIntelligence,orchestrateAgents,getExecutiveDashboard};
