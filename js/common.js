const SeminarApp = (() => {
  // API 주소는 localStorage로 덮어쓸 수 있게 해서 배포/테스트 환경을 쉽게 바꾼다.
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

  // 모든 페이지에서 공통으로 쓰는 로그인, 회원가입, 로그아웃 이벤트를 연결한다.
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

  // 교실 목록과 예약 목록을 서버에서 같이 가져오고, 실패하면 기본 교실 목록을 보여준다.
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

  // 공통 fetch 래퍼. JSON 헤더, 인증 토큰, 에러 메시지 처리를 한곳에서 관리한다.
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

  // 선생님 로그인 후 토큰을 저장하고, 선생님 페이지가 아니면 관리 화면으로 이동한다.
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

  // 선생님 계정을 만들고 성공하면 로그인 모달로 자연스럽게 이어준다.
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

  // 서버가 순수 문자열을 내려줘도 화면에 표시할 수 있게 안전하게 파싱한다.
  function safeJsonParse(text) {
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }

  // 백엔드 응답이 배열, data, list 중 어떤 형태여도 목록으로 맞춘다.
  function unwrapList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.list)) return payload.list;
    return [];
  }

  // 교실 데이터의 필드 이름과 상태 값을 프론트에서 쓰는 형태로 통일한다.
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

  // 예약 데이터도 화면 렌더링에 필요한 구조로 정규화한다.
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

  // 서버의 숫자/문자 상태 값을 교실 상태 코드로 변환한다.
  function normalizeClassroomStatus(status) {
    if (status === 0 || status === "USE") return "USE";
    if (status === 1 || status === "ONE") return "ONE";
    return "EMPTY";
  }

  // 예약 승인 상태를 READY, ALLOW, REFUSE 중 하나로 통일한다.
  function normalizeReservationStatus(status) {
    if (status === 0 || status === "ALLOW") return "ALLOW";
    if (status === 2 || status === "REFUSE") return "REFUSE";
    return "READY";
  }

  // 특정 교실과 교시에 해당하는 예약을 찾는다.
  function getReservationForClassroom(classroomId, period, statuses) {
    return state.reservations.find(
      (reservation) =>
        String(reservation.classroomId) === String(classroomId) &&
        String(reservation.time) === String(period) &&
        statuses.includes(reservation.status),
    );
  }

  // 교실 자체 상태와 예약 상태를 합쳐 화면에서 쓸 카드 상태를 계산한다.
  function getRoomStatus(room, reservation) {
    if (reservation?.status === "READY") return "pending";
    if (reservation?.status === "ALLOW") return "using";
    if (room?.status === "USE") return "unavailable";
    return "available";
  }

  // dialog 미지원 브라우저에서도 open 속성으로 모달을 표시한다.
  function openDialog(dialog) {
    if (!dialog) return;
    if (dialog.showModal) {
      dialog.showModal();
      return;
    }
    dialog.setAttribute("open", "");
  }

  // dialog 미지원 브라우저까지 고려해서 모달을 닫는다.
  function closeDialog(dialog) {
    if (!dialog) return;
    if (dialog.close) {
      dialog.close();
      return;
    }
    dialog.removeAttribute("open");
  }

  // 로그인 여부에 따라 선생님 패널과 로그인 버튼 문구를 갱신한다.
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

  // select 옵션을 공통 방식으로 다시 채운다.
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

  // 로딩, 빈 목록, 에러 안내에 쓰는 공통 상태 박스를 만든다.
  function createStateBox(message, type = "") {
    const box = document.createElement("div");
    box.className = `empty-state${type ? ` ${type}` : ""}`;
    box.textContent = message;
    return box;
  }

  // 동적으로 생성하는 버튼의 기본 속성과 클릭 이벤트를 묶어 만든다.
  function createActionButton(label, action, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (className) button.className = className;
    button.addEventListener("click", action);
    return button;
  }

  // 로그인 모달의 에러 문구를 갱신한다.
  function setLoginError(message) {
    const loginError = document.querySelector("#loginError");
    if (!loginError) return;
    loginError.textContent = message;
  }

  // 회원가입 모달의 안내/에러 문구를 갱신한다.
  function setSignupMessage(message, isError = false) {
    const signupMessage = document.querySelector("#signupMessage");
    if (!signupMessage) return;
    signupMessage.textContent = message;
    signupMessage.style.color = isError ? "var(--red)" : "var(--green)";
  }

  // 저장된 선생님 인증 토큰을 가져온다.
  function getToken() {
    return localStorage.getItem(tokenKey);
  }

  // 네트워크/서버 오류를 사용자가 이해할 수 있는 문장으로 바꾼다.
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
