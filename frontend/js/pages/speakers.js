// SPEAKERS PAGE — speaker CRUD + Speaker Agent recommendations

let CTX = { activeEventId: null, activeEvent: null };

document.addEventListener('DOMContentLoaded', async () => {
  CTX = await initShared();
  if (!isAdmin(CTX.user)) { lockPageForAccount(CTX.user); return; }
  if (!CTX.activeEvent) {
    $('.two-col').outerHTML = `<div class="empty"><h3>No event selected</h3><div>Create or select an event first.</div></div>`;
    $$('#speakersList, #speakerResults').forEach(el => el.closest('.card, div')?.remove());
    return;
  }

  $('#createSpeakerBtn').addEventListener('click', createSpeaker);
  $('#recommendSpeakerBtn').addEventListener('click', recommendSpeakers);
  await refreshSpeakersList();
});

async function refreshSpeakersList() {
  const list = $('#speakersList');
  const speakers = await apiGet(`/events/${CTX.activeEvent.id}/speakers`);
  if (speakers.length === 0) {
    list.innerHTML = `<div class="empty"><h3>No speakers yet</h3><div>Add a speaker above so the Speaker Agent has options to rank.</div></div>`;
    return;
  }
  list.innerHTML = `<table><thead><tr><th>Speaker</th><th>Expertise</th><th>Experience</th><th>Fee</th><th>Feedback</th></tr></thead><tbody>
    ${speakers.map(s => `
      <tr>
        <td><b style="color:var(--text)">${escapeHtml(s.name)}</b><div style="color:var(--dim); font-size:12px;">${escapeHtml(s.language)}</div></td>
        <td>
          <div class="pill-list">${s.expertise.split(',').map(t => `<span class="pill on">${escapeHtml(t.trim())}</span>`).join('')}</div>
        </td>
        <td>${s.experience_years} yrs</td>
        <td>₹${s.fee}</td>
        <td class="mono">${s.engagement_score}/5</td>
      </tr>
    `).join('')}
  </tbody></table>`;
}

async function createSpeaker() {
  const msg = $('#speakerMsg');
  msg.classList.remove('show');
  const name = $('#spName').value.trim();
  const expertise = $('#spExpertise').value.trim();
  const contactNumber = $('#spContactNumber').value.trim();
  if (!name || !expertise) {
    msg.textContent = 'Name and expertise are required.';
    msg.className = 'msg error show';
    return;
  }
  if (!contactNumber) {
    msg.textContent = 'Contact number is required.';
    msg.className = 'msg error show';
    return;
  }

  const btn = $('#createSpeakerBtn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Adding…';

  try {
    await apiPost(`/events/${CTX.activeEvent.id}/speakers`, {
      name, contactNumber, expertise, language: $('#spLanguage').value.trim() || 'English',
      experienceYears: $('#spExperience').value, fee: $('#spFee').value,
      engagementScore: $('#spEngagement').value || 3,
      availableDates: $('#spDates').value.trim(),
      availableStart: $('#spAvailStart').value, availableEnd: $('#spAvailEnd').value,
    });
    $('#spName').value = ''; $('#spContactNumber').value = ''; $('#spExpertise').value = ''; $('#spExperience').value = '';
    $('#spFee').value = ''; $('#spEngagement').value = ''; $('#spDates').value = '';
    await refreshSpeakersList();
  } catch (e) {
    msg.textContent = e.error || 'Could not save the speaker — please try again.';
    msg.className = 'msg error show';
  } finally {
    btn.disabled = false; btn.innerHTML = '+ Add speaker';
  }
}

async function recommendSpeakers() {
  const out = $('#speakerResults');
  const btn = $('#recommendSpeakerBtn');
  const topic = $('#rqTopic').value.trim();
  if (!topic) {
    out.innerHTML = `<div class="msg error show">A session topic is required to match speakers.</div>`;
    return;
  }

  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Ranking speakers…';
  out.innerHTML = '';

  const reqCtx = {
    topic,
    date: $('#rqSDate').value,
    startTime: $('#rqSStart').value,
    endTime: $('#rqSEnd').value,
  };

  try {
    const result = await apiPost(`/events/${CTX.activeEvent.id}/speakers/recommend`, {
      topic,
      date: $('#rqSDate').value, startTime: $('#rqSStart').value, endTime: $('#rqSEnd').value,
      budget: $('#rqSBudget').value, languagePreference: $('#rqLanguage').value.trim(),
    });
    renderSpeakerResults(result.results, topic, reqCtx);
  } catch (e) {
    out.innerHTML = `<div class="msg error show">${escapeHtml(e.error || "Couldn't generate recommendations.")}</div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = 'Recommend speakers';
  }
}

function renderSpeakerResults(results, topic, reqCtx) {
  const out = $('#speakerResults');
  if (!results || results.length === 0) {
    out.innerHTML = `<div class="empty"><h3>No available speakers</h3><div>Everyone matching "${escapeHtml(topic)}" is unavailable at that time, or no speaker has been added yet.</div></div>`;
    return;
  }
  out.innerHTML = `<h3 style="font-size:14px; margin-bottom:6px;">Ranked recommendations for "${escapeHtml(topic)}"</h3>
    <div class="sub" style="color:var(--dim); font-size:12px; margin-bottom:12px;">When multiple speakers fit, they're ordered by topic relevance, language, experience, prior audience feedback and budget fit.</div>` +
    results.map((r, i) => `
      <div class="agent-card ${i === 0 ? 'top' : ''}" data-speaker-card="${r.speaker.id}">
        <div class="agent-head">
          <div>
            <h4>${i === 0 ? '🏆 ' : ''}${escapeHtml(r.speaker.name)}</h4>
            <div class="meta">${escapeHtml(r.speaker.expertise)} · ${escapeHtml(r.speaker.language)} · ₹${r.speaker.fee}</div>
            <div class="meta">📞 ${escapeHtml(r.speaker.contact_number || 'no contact on file')}</div>
          </div>
          <div class="score-pill">${r.score}<span>/ 100</span></div>
        </div>
        <p class="reasoning">${escapeHtml(r.reasoning)}</p>
        <div class="breakdown">
          <div class="bd"><span>Topic relevance</span><b>${r.breakdown.topicRelevance}</b></div>
          <div class="bd"><span>Language</span><b>${r.breakdown.language}</b></div>
          <div class="bd"><span>Experience</span><b>${r.breakdown.experience}</b></div>
          <div class="bd"><span>Engagement</span><b>${r.breakdown.engagement}</b></div>
          <div class="bd"><span>Budget fit</span><b>${r.breakdown.budget}</b></div>
        </div>
        <div class="select-row">
          <button class="btn btn-amber btn-sm" data-schedule-speaker="${r.speaker.id}">Schedule</button>
        </div>
      </div>
    `).join('');

  $$('button[data-schedule-speaker]', out).forEach(btn => btn.addEventListener('click', () => {
    const r = results.find(x => x.speaker.id === btn.dataset.scheduleSpeaker);
    scheduleSpeakerDirect(btn, reqCtx, r.speaker);
  }));
}

function scheduleSpeakerDirect(btn, reqCtx, speaker) {
  if (!reqCtx.date || !reqCtx.startTime || !reqCtx.endTime) {
    alert('Add a date, start time and end time in the form above before scheduling.');
    return;
  }
  // Hand off to the Scheduling page — it also prompts for a venue (or
  // lets the admin confirm with just this speaker).
  localStorage.setItem('checkpoint_schedule_prefill', JSON.stringify({
    topic: reqCtx.topic, date: reqCtx.date, startTime: reqCtx.startTime, endTime: reqCtx.endTime,
    speaker: { id: speaker.id, name: speaker.name },
  }));
  location.href = 'scheduling.html';
}
