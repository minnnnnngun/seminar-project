const API_BASE =
  localStorage.getItem("seminar-room-api-base") ||
  (location.protocol === "file:" ? "http://localhost:8080" : "");
const API_PREFIX = "/api/v1";
const tokenKey = "seminar-room-teacher-token-v1";

const periods = [
  { value: "8", label: "8교시" },
  { value: "9", label: "9교시" },
  { value: "10", label: "10교시" },
];

const fallbackClassrooms = [
  { id: 401, name: "4-1", floor: 4, status: "EMPTY" },
  { id: 402, name: "4-2", floor: 4, status: "EMPTY" },
  { id: 403, name: "4-3", floor: 4, status: "EMPTY" },
  { id: 404, name: "4-4", floor: 4, status: "EMPTY" },
  { id: 301, name: "3-1", floor: 3, status: "EMPTY" },
  { id: 302, name: "3-2", floor: 3, status: "EMPTY" },
  { id: 303, name: "3-3", floor: 3, status: "EMPTY" },
  { id: 304, name: "3-4", floor: 3, status: "EMPTY" },
  { id: 201, name: "2-1", floor: 2, status: "EMPTY" },
  { id: 202, name: "2-2", floor: 2, status: "EMPTY" },
  { id: 203, name: "2-3", floor: 2, status: "EMPTY" },
  { id: 204, name: "2-4", floor: 2, status: "EMPTY" },
];

const state = {
  classrooms: [],
  reservations: [],
  isLoading: true,
  apiError: "",
};

const pageType = document.body.dataset.page || "floor";
const currentFloor = Number(document.body.dataset.floor || 0);

const openReservationButton = document.querySelector("#openReservationButton");
const openLoginButton = document.querySelector("#openLoginButton");
const reservationDialog = document.querySelector("#reservationDialog");
const loginDialog = document.querySelector("#loginDialog");
const closeReservationButton = document.querySelector("#closeReservationButton");
const closeLoginButton = document.querySelector("#closeLoginButton");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const teacherName = document.querySelector("#teacherName");
const teacherPassword = document.querySelector("#teacherPassword");
const logoutButton = document.querySelector("#logoutButton");
const teacherPanel = document.querySelector("#teacherPanel");
const periodSelect = document.querySelector("#periodSelect");
const roomSelect = document.querySelector("#roomSelect");
const reservationForm = document.querySelector("#reservationForm");
const studentInput = document.querySelector("#studentInput");
const reasonInput = document.querySelector("#reasonInput");
const formMessage = document.querySelector("#formMessage");
const floorGrid = document.querySelector("#floorGrid");
const teacherInbox = document.querySelector("#teacherInbox");
const reviewDialog = document.querySelector("#reviewDialog");
const closeReviewButton = document.querySelector("#closeReviewButton");
const reviewStudent = document.querySelector("#reviewStudent");
const reviewTarget = document.querySelector("#reviewTarget");
const reviewReason = document.querySelector("#reviewReason");
const approveInReview = document.querySelector("#approveInReview");
const rejectInReview = document.querySelector("#rejectInReview");
const teacherReasonInput = document.querySelector("#teacherReasonInput");
const floorTemplate = document.querySelector("#floorTemplate");
const roomCardTemplate = document.querySelector("#roomCardTemplate");

let currentReviewId = null;

init();

async function init() {
  fillSelect(periodSelect, periods);
  bindEvents();
  setLoggedIn(Boolean(getToken()));
  await loadRemoteData();
  render();
}

function bindEvents() {
  openReservationButton?.addEventListener("click", () => {
    fillRoomSelect();
    openDialog(reservationDialog);
  });

  openLoginButton?.addEventListener("click", () => {
    if (getToken()) {
      if (pageType === "teacher") {
        setLoggedIn(true);
      } else {
        location.href = "teacher.html";
      }
      return;
    }
    openDialog(loginDialog);
  });

  closeReservationButton?.addEventListener("click", () => closeDialog(reservationDialog));
  closeLoginButton?.addEventListener("click", () => closeDialog(loginDialog));
  closeReviewButton?.addEventListener("click", () => closeDialog(reviewDialog));

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loginTeacher();
  });

  logoutButton?.addEventListener("click", () => {
    localStorage.removeItem(tokenKey);
    setLoggedIn(false);
    render();
  });

  reservationForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createReservation();
  });

  periodSelect?.addEventListener("change", render);

  approveInReview?.addEventListener("click", async () => {
    if (!currentReviewId) return;
    await updateReservationStatus(currentReviewId, "ALLOW");
    closeDialog(reviewDialog);
  });

  rejectInReview?.addEventListener("click", async () => {
    if (!currentReviewId) return;
    await updateReservationStatus(currentReviewId, "REFUSE");
    closeDialog(reviewDialog);
  });
}

async function loadRemoteData() {
  state.isLoading = true;
  state.apiError = "";
  render();

  try {
    const [classroomsResponse, reservationsResponse] = await Promise.all([
      apiRequest("/classrooms"),
      apiRequest("/reservation"),
    ]);

    state.classrooms = unwrapList(classroomsResponse).map(normalizeClassroom);
    state.reservations = unwrapList(reservationsResponse).map(normalizeReservation);
  } catch (error) {
    state.apiError = getErrorMessage(error);
    state.classrooms = fallbackClassrooms.map(normalizeClassroom);
    state.reservations = [];
  } finally {
    state.isLoading = false;
    fillRoomSelect();
  }
}

async function apiRequest(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...options.headers,
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token) {
    headers.Authorization = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${API_PREFIX}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;
  const authorization = response.headers.get("Authorization");

  if (!response.ok) {
    throw new Error(payload?.message || payload?.massage || `요청 실패 (${response.status})`);
  }

  if (authorization && payload && typeof payload === "object" && !Array.isArray(payload)) {
    payload.Authorization ??= authorization;
  }

  if (authorization && !payload) {
    return { Authorization: authorization };
  }

  return payload;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.list)) return payload.list;
  return [];
}

function normalizeClassroom(classroom) {
  const name = String(classroom?.name ?? "");
  const id = classroom?.id ?? classroom?.classroomId ?? name;
  const floor = Number(classroom?.floor ?? name.match(/\d+/)?.[0]?.[0] ?? 0);

  return {
    id,
    name,
    floor,
    floorLabel: `${floor}층`,
    status: normalizeClassroomStatus(classroom?.status),
  };
}

function normalizeReservation(reservation) {
  const classroom = normalizeClassroom(reservation?.classroom || {});
  const time = reservation?.time ?? reservation?.period ?? "";
  const status = normalizeReservationStatus(reservation?.status ?? reservation?.requestStatus);

  return {
    id: reservation?.id,
    classroomId: classroom.id,
    classroom,
    name: reservation?.name ?? reservation?.student ?? "",
    reason: reservation?.reason ?? "",
    time: String(time),
    status,
  };
}

function normalizeClassroomStatus(status) {
  if (status === 0 || status === "USE") return "USE";
  if (status === 1 || status === "ONE") return "ONE";
  return "EMPTY";
}

function normalizeReservationStatus(status) {
  if (status === 0 || status === "ALLOW") return "ALLOW";
  if (status === 2 || status === "REFUSE") return "REFUSE";
  return "READY";
}

async function loginTeacher() {
  const name = teacherName?.value.trim();
  const pw = teacherPassword?.value.trim();

  if (!name || !pw) {
    setLoginError("이름과 비밀번호를 모두 입력해 주세요.");
    return;
  }

  try {
    const payload = await apiRequest("/teachers/login", {
      method: "POST",
      body: JSON.stringify({ name, pw }),
    });
    const token = payload?.Authorization || payload?.authorization || payload?.token || payload?.data;

    if (!token || typeof token !== "string") {
      throw new Error("로그인 토큰을 찾을 수 없습니다.");
    }

    localStorage.setItem(tokenKey, token);
    setLoginError("");
    setLoggedIn(true);
    closeDialog(loginDialog);

    if (pageType !== "teacher") {
      location.href = "teacher.html";
      return;
    }

    await loadRemoteData();
    render();
  } catch (error) {
    setLoginError(getErrorMessage(error));
  }
}

async function createReservation() {
  const classroomId = roomSelect.value;
  const name = studentInput.value.trim();
  const reason = reasonInput.value.trim();
  const time = Number(periodSelect.value);
  const classroom = state.classrooms.find((item) => String(item.id) === String(classroomId));

  if (!classroomId || !name || !reason || !time) {
    setMessage("이름, 사유, 교실, 시간을 모두 입력해 주세요.", true);
    return;
  }

  if (classroom?.status === "USE") {
    setMessage(`${classroom.name}실은 현재 사용 중이라 예약할 수 없습니다.`, true);
    return;
  }

  if (getReservationForClassroom(classroomId, String(time), ["READY", "ALLOW"])) {
    setMessage(`${classroom?.name || "선택한 교실"}은 ${time}교시에 이미 신청 또는 사용 중입니다.`, true);
    return;
  }

  setMessage("예약을 신청하는 중입니다.");

  try {
    const payload = await apiRequest("/reservation", {
      method: "POST",
      body: JSON.stringify({
        classroomId,
        reason,
        name,
        time,
      }),
    });

    reservationForm.reset();
    periodSelect.value = String(time);
    await loadRemoteData();
    setMessage(payload?.message || payload?.massage || "예약 신청이 완료되었습니다. 선생님 승인 후 사용할 수 있습니다.");
  } catch (error) {
    setMessage(getErrorMessage(error), true);
  }
}

async function updateReservationStatus(id, status) {
  const buttonText = status === "ALLOW" ? "승인" : "거절";

  try {
    await apiRequest("/reservation/Status", {
      method: "PATCH",
      body: JSON.stringify({
        id,
        status,
        requestStatus: status,
      }),
    });
    await loadRemoteData();
  } catch (error) {
    alert(`${buttonText} 처리에 실패했습니다. ${getErrorMessage(error)}`);
  }
}

async function deleteReservation(id) {
  try {
    await apiRequest(`/reservation?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await loadRemoteData();
  } catch (error) {
    alert(`예약 삭제에 실패했습니다. ${getErrorMessage(error)}`);
  }
}

function openReviewDialog(id) {
  const reservation = state.reservations.find((item) => String(item.id) === String(id));
  if (!reservation || reservation.status !== "READY") return;

  currentReviewId = id;
  reviewStudent.textContent = reservation.name;
  reviewTarget.textContent = `${reservation.classroom.floorLabel} ${reservation.classroom.name}실 / ${reservation.time}교시`;
  reviewReason.textContent = reservation.reason;
  teacherReasonInput.value = "";

  openDialog(reviewDialog);
}

function openDialog(dialog) {
  if (!dialog) return;
  if (dialog.showModal) {
    dialog.showModal();
    return;
  }
  dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (dialog.close) {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
}

function setLoggedIn(isLoggedIn) {
  if (teacherPanel) teacherPanel.hidden = !isLoggedIn;
  if (openLoginButton) openLoginButton.textContent = isLoggedIn ? "선생님 페이지" : "선생님 로그인";
  if (isLoggedIn) {
    if (teacherName) teacherName.value = "";
    if (teacherPassword) teacherPassword.value = "";
    setLoginError("");
  }
}

function fillSelect(select, options) {
  if (!select) return;
  select.innerHTML = "";
  options.forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
}

function fillRoomSelect() {
  const classrooms = getVisibleClassrooms();
  fillSelect(
    roomSelect,
    classrooms.map((room) => ({
      value: room.id,
      label: `${room.floorLabel} ${room.name}실`,
    })),
  );
}

function render() {
  renderFloors();
  renderInbox();
}

function renderFloors() {
  if (!floorGrid) return;

  floorGrid.innerHTML = "";

  if (state.isLoading) {
    floorGrid.append(createStateBox("교실 정보를 불러오는 중입니다."));
    return;
  }

  if (state.apiError) {
    floorGrid.append(createStateBox(`서버 연결 실패: ${state.apiError}`, "error"));
  }

  const classrooms = getVisibleClassrooms();
  if (classrooms.length === 0) {
    floorGrid.append(createStateBox("표시할 교실이 없습니다.", "empty"));
    return;
  }

  getFloors(classrooms).forEach((floor) => {
    const section = floorTemplate.content.firstElementChild.cloneNode(true);
    const heading = section.querySelector(".floor-heading");
    heading.querySelector("h2").textContent = `${floor}층`;
    heading.querySelector("span").textContent = `${classrooms.filter((room) => room.floor === floor).length}개 세미나실`;
    heading.querySelector("h2").after(createFloorLegend());

    const grid = section.querySelector(".room-grid");
    classrooms
      .filter((room) => room.floor === floor)
      .forEach((room) => grid.append(createRoomCard(room)));

    floorGrid.append(section);
  });
}

function createRoomCard(room) {
  const period = periodSelect?.value || periods[0].value;
  const reservation = getReservationForClassroom(room.id, period, ["READY", "ALLOW"]);
  const status = getRoomStatus(room, reservation);
  const card = roomCardTemplate.content.firstElementChild.cloneNode(true);

  card.classList.add(status);
  card.querySelector("h3").textContent = `${room.name}실`;
  card.querySelector(".room-subtitle").textContent = `${room.floorLabel} · ${getClassroomStatusLabel(room.status)}`;

  const pill = card.querySelector(".status-pill");
  pill.classList.add(status);
  pill.textContent = getStatusLabel(status);

  const details = card.querySelector(".room-details");
  addDetail(details, "상태", getStatusDescription(status, reservation));
  addDetail(details, "시간", `${period}교시`);
  if (reservation) {
    addDetail(details, "이름", reservation.name);
    addDetail(details, "사유", reservation.reason);
  }
  details.after(createPeriodSummary(room.id, period));

  const actions = card.querySelector(".card-actions");
  if (status === "available") {
    actions.append(createActionButton("시간 예약", () => {
      roomSelect.value = room.id;
      openDialog(reservationDialog);
    }));
  }
  if (status === "pending" && getToken() && reviewDialog) {
    actions.append(createActionButton("예약 검토", () => openReviewDialog(reservation.id)));
  }
  if ((status === "pending" || status === "using") && getToken() && pageType === "teacher") {
    actions.append(createActionButton("예약 삭제", () => deleteReservation(reservation.id), "secondary"));
  }

  return card;
}

function renderInbox() {
  if (!teacherInbox) return;

  teacherInbox.innerHTML = "";

  if (!getToken()) {
    teacherInbox.append(createStateBox("로그인 후 예약 신청을 관리할 수 있습니다.", "empty"));
    return;
  }

  if (state.isLoading) {
    teacherInbox.append(createStateBox("예약 신청을 불러오는 중입니다."));
    return;
  }

  if (state.apiError) {
    teacherInbox.append(createStateBox(`서버 연결 실패: ${state.apiError}`, "error"));
    return;
  }

  const pendingReservations = state.reservations.filter((item) => item.status === "READY");
  if (pendingReservations.length === 0) {
    teacherInbox.append(createStateBox("아직 승인 대기 중인 예약이 없습니다.", "empty"));
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
    actions.append(createActionButton("예약 검토", () => openReviewDialog(reservation.id)));

    article.append(title, message, time, actions);
    teacherInbox.append(article);
  });
}

function getVisibleClassrooms() {
  return state.classrooms
    .filter((room) => !currentFloor || room.floor === currentFloor)
    .sort((a, b) => a.floor - b.floor || String(a.name).localeCompare(String(b.name), "ko-KR"));
}

function getFloors(classrooms) {
  return [...new Set(classrooms.map((room) => room.floor).filter(Boolean))].sort((a, b) => b - a);
}

function getReservationForClassroom(classroomId, period, statuses) {
  return state.reservations.find(
    (reservation) =>
      String(reservation.classroomId) === String(classroomId) &&
      String(reservation.time) === String(period) &&
      statuses.includes(reservation.status),
  );
}

function getRoomStatus(room, reservation) {
  if (reservation?.status === "READY") return "pending";
  if (reservation?.status === "ALLOW") return "using";
  if (room?.status === "USE") return "unavailable";
  return "available";
}

function addDetail(list, term, value) {
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = value;
  list.append(dt, dd);
}

function createActionButton(label, action, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", action);
  return button;
}

function createFloorLegend() {
  const legend = document.createElement("div");
  legend.className = "floor-status-list";

  [
    { className: "pending", label: "승인 대기" },
    { className: "unavailable", label: "사용 중" },
    { className: "available", label: "사용 가능" },
  ].forEach((item) => {
    const entry = document.createElement("span");
    const dot = document.createElement("i");
    dot.className = `dot ${item.className}`;
    entry.append(dot, item.label);
    legend.append(entry);
  });

  return legend;
}

function createPeriodSummary(classroomId, selectedPeriod) {
  const summary = document.createElement("div");
  summary.className = "period-summary";

  periods.forEach((period) => {
    const reservation = getReservationForClassroom(classroomId, period.value, ["READY", "ALLOW"]);
    const room = state.classrooms.find((item) => String(item.id) === String(classroomId));
    const status = getRoomStatus(room, reservation);
    const item = document.createElement("span");

    item.className = `period-chip ${status}`;
    if (period.value === selectedPeriod) item.classList.add("active");
    item.textContent = `${period.label} ${getShortStatusLabel(status)}`;
    summary.append(item);
  });

  return summary;
}

function createStateBox(message, type = "") {
  const box = document.createElement("div");
  box.className = `empty-state${type ? ` ${type}` : ""}`;
  box.textContent = message;
  return box;
}

function getClassroomStatusLabel(status) {
  return {
    USE: "사용 중",
    ONE: "일부 사용",
    EMPTY: "비어 있음",
  }[status];
}

function getStatusLabel(status) {
  return {
    available: "사용 가능",
    pending: "승인 대기",
    using: "사용 중",
    unavailable: "사용 중",
  }[status];
}

function getShortStatusLabel(status) {
  return {
    available: "가능",
    pending: "대기",
    using: "사용",
    unavailable: "사용",
  }[status];
}

function getStatusDescription(status, reservation) {
  if (status === "unavailable") return "현재 교실이 사용 중입니다";
  if (status === "pending") return `${reservation.name}님 승인 대기`;
  if (status === "using") return `${reservation.name}님 사용 승인`;
  return "예약할 수 있습니다";
}

function setMessage(message, isError = false) {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.style.color = isError ? "var(--red)" : "var(--green)";
}

function setLoginError(message) {
  if (!loginError) return;
  loginError.textContent = message;
}

function getToken() {
  return localStorage.getItem(tokenKey);
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
}
