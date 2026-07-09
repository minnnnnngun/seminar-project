const SeminarApp = (() => {
  const API_BASE =
    localStorage.getItem("seminar-room-api-base") ||
    "https://seminar.sungju.xyz";
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

  let onDataChange = () => {};
  let onLogout = () => {};

  function bindCommonEvents(options = {}) {
    onDataChange = options.onDataChange || (() => {});
    onLogout = options.onLogout || (() => {});

    const pageType = document.body.dataset.page || "floor";
    const openLoginButton = document.querySelector("#openLoginButton");
    const openSignupButton = document.querySelector("#openSignupButton");
    const openSignupFromLoginButton = document.querySelector("#openSignupFromLoginButton");
    const closeLoginButton = document.querySelector("#closeLoginButton");
    const closeSignupButton = document.querySelector("#closeSignupButton");
    const loginForm = document.querySelector("#loginForm");
    const signupForm = document.querySelector("#signupForm");
    const logoutButton = document.querySelector("#logoutButton");

    openLoginButton?.addEventListener("click", () => {
      if (getToken()) {
        if (pageType === "teacher") {
          setLoggedIn(true);
        } else {
          location.href = "teacher.html";
        }
        return;
      }
      openDialog(document.querySelector("#loginDialog"));
    });

    openSignupButton?.addEventListener("click", () => openDialog(document.querySelector("#signupDialog")));
    openSignupFromLoginButton?.addEventListener("click", () => {
      closeDialog(document.querySelector("#loginDialog"));
      openDialog(document.querySelector("#signupDialog"));
    });

    closeLoginButton?.addEventListener("click", () => closeDialog(document.querySelector("#loginDialog")));
    closeSignupButton?.addEventListener("click", () => closeDialog(document.querySelector("#signupDialog")));

    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await loginTeacher();
    });

    signupForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await signupTeacher();
    });

    logoutButton?.addEventListener("click", () => {
      localStorage.removeItem(tokenKey);
      setLoggedIn(false);
      onLogout();
    });
  }

  async function loadRemoteData() {
    state.isLoading = true;
    state.apiError = "";
    onDataChange();

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
      onDataChange();
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

  async function loginTeacher() {
    const teacherName = document.querySelector("#teacherName");
    const teacherPassword = document.querySelector("#teacherPassword");
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
      closeDialog(document.querySelector("#loginDialog"));

      if ((document.body.dataset.page || "floor") !== "teacher") {
        location.href = "teacher.html";
        return;
      }

      await loadRemoteData();
    } catch (error) {
      setLoginError(getErrorMessage(error));
    }
  }

  async function signupTeacher() {
    const signupForm = document.querySelector("#signupForm");
    const signupTeacherName = document.querySelector("#signupTeacherName");
    const signupTeacherKey = document.querySelector("#signupTeacherKey");
    const signupTeacherPassword = document.querySelector("#signupTeacherPassword");
    const name = signupTeacherName?.value.trim();
    const teachearPw = signupTeacherKey?.value.trim();
    const pw = signupTeacherPassword?.value.trim();

    if (!name || !teachearPw || !pw) {
      setSignupMessage("이름, 가입 코드, 비밀번호를 모두 입력해 주세요.", true);
      return;
    }

    setSignupMessage("회원가입을 요청하는 중입니다.");

    try {
      const payload = await apiRequest("/teachers", {
        method: "POST",
        body: JSON.stringify({ name, teachearPw, pw }),
      });

      signupForm.reset();
      setSignupMessage(payload?.message || payload?.massage || "회원가입이 완료되었습니다. 로그인해 주세요.");

      const teacherName = document.querySelector("#teacherName");
      const teacherPassword = document.querySelector("#teacherPassword");
      if (teacherName) teacherName.value = name;
      if (teacherPassword) teacherPassword.value = "";

      setTimeout(() => {
        closeDialog(document.querySelector("#signupDialog"));
        openDialog(document.querySelector("#loginDialog"));
      }, 700);
    } catch (error) {
      setSignupMessage(getErrorMessage(error), true);
    }
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
    const teacherPanel = document.querySelector("#teacherPanel");
    const openLoginButton = document.querySelector("#openLoginButton");
    const teacherName = document.querySelector("#teacherName");
    const teacherPassword = document.querySelector("#teacherPassword");

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

  function createStateBox(message, type = "") {
    const box = document.createElement("div");
    box.className = `empty-state${type ? ` ${type}` : ""}`;
    box.textContent = message;
    return box;
  }

  function createActionButton(label, action, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener("click", action);
    return button;
  }

  function setLoginError(message) {
    const loginError = document.querySelector("#loginError");
    if (!loginError) return;
    loginError.textContent = message;
  }

  function setSignupMessage(message, isError = false) {
    const signupMessage = document.querySelector("#signupMessage");
    if (!signupMessage) return;
    signupMessage.textContent = message;
    signupMessage.style.color = isError ? "var(--red)" : "var(--green)";
  }

  function getToken() {
    return localStorage.getItem(tokenKey);
  }

  function getErrorMessage(error) {
    if (error instanceof TypeError && error.message === "Failed to fetch") {
      return "브라우저에서 API 요청이 차단되었습니다. 서버 CORS 설정에서 이 프론트 주소를 허용해야 합니다.";
    }
    return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
  }

  return {
    apiRequest,
    bindCommonEvents,
    closeDialog,
    createActionButton,
    createStateBox,
    fillSelect,
    getErrorMessage,
    getReservationForClassroom,
    getRoomStatus,
    getToken,
    loadRemoteData,
    openDialog,
    periods,
    setLoggedIn,
    state,
  };
})();
