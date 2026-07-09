const app = SeminarApp;

const teacherInbox = document.querySelector("#teacherInbox");
const reviewDialog = document.querySelector("#reviewDialog");
const closeReviewButton = document.querySelector("#closeReviewButton");
const reviewStudent = document.querySelector("#reviewStudent");
const reviewTarget = document.querySelector("#reviewTarget");
const reviewReason = document.querySelector("#reviewReason");
const approveInReview = document.querySelector("#approveInReview");
const rejectInReview = document.querySelector("#rejectInReview");
const teacherReasonInput = document.querySelector("#teacherReasonInput");

let currentReviewId = null;

initTeacherPage();

async function initTeacherPage() {
  app.bindCommonEvents({
    onDataChange: renderInbox,
    onLogout: renderInbox,
  });
  bindTeacherEvents();
  app.setLoggedIn(Boolean(app.getToken()));
  await app.loadRemoteData();
}

function bindTeacherEvents() {
  closeReviewButton?.addEventListener("click", () => app.closeDialog(reviewDialog));

  approveInReview?.addEventListener("click", async () => {
    if (!currentReviewId) return;
    await updateReservationStatus(currentReviewId, "ALLOW");
    app.closeDialog(reviewDialog);
  });

  rejectInReview?.addEventListener("click", async () => {
    if (!currentReviewId) return;
    await updateReservationStatus(currentReviewId, "REFUSE");
    app.closeDialog(reviewDialog);
  });
}

async function updateReservationStatus(id, status) {
  const buttonText = status === "ALLOW" ? "승인" : "거절";

  try {
    await app.apiRequest("/reservation/Status", {
      method: "PATCH",
      body: JSON.stringify({
        id,
        status,
        requestStatus: status,
      }),
    });
    await app.loadRemoteData();
  } catch (error) {
    alert(`${buttonText} 처리에 실패했습니다. ${app.getErrorMessage(error)}`);
  }
}

async function deleteReservation(id) {
  try {
    await app.apiRequest(`/reservation?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await app.loadRemoteData();
  } catch (error) {
    alert(`예약 삭제에 실패했습니다. ${app.getErrorMessage(error)}`);
  }
}

function openReviewDialog(id) {
  const reservation = app.state.reservations.find((item) => String(item.id) === String(id));
  if (!reservation || reservation.status !== "READY") return;

  currentReviewId = id;
  reviewStudent.textContent = reservation.name;
  reviewTarget.textContent = `${reservation.classroom.floorLabel} ${reservation.classroom.name}실 / ${reservation.time}교시`;
  reviewReason.textContent = reservation.reason;
  teacherReasonInput.value = "";

  app.openDialog(reviewDialog);
}

function renderInbox() {
  if (!teacherInbox) return;

  teacherInbox.innerHTML = "";

  if (!app.getToken()) {
    teacherInbox.append(app.createStateBox("로그인 후 예약 신청을 관리할 수 있습니다.", "empty"));
    return;
  }

  if (app.state.isLoading) {
    teacherInbox.append(app.createStateBox("예약 신청을 불러오는 중입니다."));
    return;
  }

  if (app.state.apiError) {
    teacherInbox.append(app.createStateBox(`서버 연결 실패: ${app.state.apiError}`, "error"));
    return;
  }

  const pendingReservations = app.state.reservations.filter((item) => item.status === "READY");
  if (pendingReservations.length === 0) {
    teacherInbox.append(app.createStateBox("아직 승인 대기 중인 예약이 없습니다.", "empty"));
    return;
  }

  pendingReservations.forEach((reservation) => {
    const article = document.createElement("article");
    article.className = "notice";
    article.dataset.reservationId = reservation.id;

    const title = document.createElement("strong");
    const message = document.createElement("p");
    const time = document.createElement("small");
    const actions = document.createElement("div");

    title.textContent = "승인 대기";
    message.textContent = `${reservation.name}님이 ${reservation.time}교시에 ${reservation.classroom.floorLabel} ${reservation.classroom.name}실 사용을 신청했습니다. 사유는 '${reservation.reason}'입니다.`;
    time.textContent = `예약 ID ${reservation.id}`;
    actions.className = "notice-actions";
    actions.append(app.createActionButton("예약 검토", () => openReviewDialog(reservation.id)));
    actions.append(app.createActionButton("예약 삭제", () => deleteReservation(reservation.id), "secondary"));

    article.append(title, message, time, actions);
    teacherInbox.append(article);
  });
}
