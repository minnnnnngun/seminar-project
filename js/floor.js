const FloorPage = (() => {
  const app = SeminarApp;
  const currentFloor = Number(document.body.dataset.floor || 0);

  // 예약 모달, 교실 목록, 카드 템플릿처럼 층 화면에서 직접 다루는 DOM 요소들이다.
  const openReservationButton = document.querySelector("#openReservationButton");
  const reservationDialog = document.querySelector("#reservationDialog");
  const closeReservationButton = document.querySelector("#closeReservationButton");
  const periodSelect = document.querySelector("#periodSelect");
  const roomSelect = document.querySelector("#roomSelect");
  const reservationForm = document.querySelector("#reservationForm");
  const studentInput = document.querySelector("#studentInput");
  const reasonInput = document.querySelector("#reasonInput");
  const formMessage = document.querySelector("#formMessage");
  const floorGrid = document.querySelector("#floorGrid");
  const floorTemplate = document.querySelector("#floorTemplate");
  const roomCardTemplate = document.querySelector("#roomCardTemplate");

  init();

  // 공통 이벤트를 연결하고 서버 데이터를 불러와 첫 화면을 그린다.
  async function init() {
    app.fillSelect(periodSelect, app.periods);
    app.bindCommonEvents({
      onDataChange: () => {
        fillRoomSelect();
        render();
      },
    });
    bindFloorEvents();
    app.setLoggedIn(Boolean(app.getToken()));
    await app.loadRemoteData();
  }

  // 예약 열기, 닫기, 신청, 교시 변경처럼 층 화면 전용 이벤트를 연결한다.
  function bindFloorEvents() {
    openReservationButton?.addEventListener("click", () => {
      fillRoomSelect();
      app.openDialog(reservationDialog);
    });

    closeReservationButton?.addEventListener("click", () => app.closeDialog(reservationDialog));

    reservationForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await createReservation();
    });

    periodSelect?.addEventListener("change", render);
  }

  // 학생 예약 신청을 검증한 뒤 서버에 등록한다.
  async function createReservation() {
    const classroomId = roomSelect.value;
    const name = studentInput.value.trim();
    const reason = reasonInput.value.trim();
    const time = Number(periodSelect.value);
    const classroom = app.state.classrooms.find((item) => String(item.id) === String(classroomId));

    if (!classroomId || !name || !reason || !time) {
      setMessage("이름, 사유, 교실, 시간을 모두 입력해 주세요.", true);
      return;
    }

    if (classroom?.status === "USE") {
      setMessage(`${classroom.name}실은 현재 사용 중이라 예약할 수 없습니다.`, true);
      return;
    }

    if (app.getReservationForClassroom(classroomId, String(time), ["READY", "ALLOW"])) {
      setMessage(`${classroom?.name || "선택한 교실"}은 ${time}교시에 이미 신청 또는 사용 중입니다.`, true);
      return;
    }

    setMessage("예약을 신청하는 중입니다.");

    try {
      const payload = await app.apiRequest("/reservation", {
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
      await app.loadRemoteData();
      setMessage(payload?.message || payload?.massage || "예약 신청이 완료되었습니다. 선생님 승인 후 사용할 수 있습니다.");
    } catch (error) {
      setMessage(app.getErrorMessage(error), true);
    }
  }

  // 데이터 상태가 바뀔 때마다 층별 교실 목록을 다시 그린다.
  function render() {
    renderFloors();
  }

  // 로딩/에러/빈 목록 상태를 처리하고 층 섹션을 만든다.
  function renderFloors() {
    if (!floorGrid) return;

    floorGrid.innerHTML = "";

    if (app.state.isLoading) {
      floorGrid.append(app.createStateBox("교실 정보를 불러오는 중입니다."));
      return;
    }

    if (app.state.apiError) {
      floorGrid.append(app.createStateBox(`서버 연결 실패: ${app.state.apiError}`, "error"));
    }

    const classrooms = getVisibleClassrooms();
    if (classrooms.length === 0) {
      floorGrid.append(app.createStateBox("표시할 교실이 없습니다.", "empty"));
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

  // 교실 하나를 카드 형태로 만들고 현재 교시의 예약 상태를 반영한다.
  function createRoomCard(room) {
    const period = periodSelect?.value || app.periods[0].value;
    const reservation = app.getReservationForClassroom(room.id, period, ["READY", "ALLOW"]);
    const status = app.getRoomStatus(room, reservation);
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
      actions.append(app.createActionButton("시간 예약", () => {
        roomSelect.value = room.id;
        app.openDialog(reservationDialog);
      }));
    }

    return card;
  }

  // 예약 모달의 교실 선택지를 현재 페이지 층에 맞게 채운다.
  function fillRoomSelect() {
    const classrooms = getVisibleClassrooms();
    app.fillSelect(
      roomSelect,
      classrooms.map((room) => ({
        value: room.id,
        label: `${room.floorLabel} ${room.name}실`,
      })),
    );
  }

  // 현재 페이지가 특정 층이면 그 층만, 아니면 전체 교실을 정렬해서 반환한다.
  function getVisibleClassrooms() {
    return app.state.classrooms
      .filter((room) => !currentFloor || room.floor === currentFloor)
      .sort((a, b) => a.floor - b.floor || String(a.name).localeCompare(String(b.name), "ko-KR"));
  }

  // 화면에 표시할 층 번호 목록을 높은 층부터 정렬한다.
  function getFloors(classrooms) {
    return [...new Set(classrooms.map((room) => room.floor).filter(Boolean))].sort((a, b) => b - a);
  }

  // 카드 상세 정보 영역에 제목과 값을 한 줄 추가한다.
  function addDetail(list, term, value) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = value;
    list.append(dt, dd);
  }

  // 층 제목 옆에 보이는 상태 범례를 동적으로 만든다.
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

  // 각 교시별 예약 가능/대기/사용 상태를 작은 칩 목록으로 보여준다.
  function createPeriodSummary(classroomId, selectedPeriod) {
    const summary = document.createElement("div");
    summary.className = "period-summary";

    app.periods.forEach((period) => {
      const reservation = app.getReservationForClassroom(classroomId, period.value, ["READY", "ALLOW"]);
      const room = app.state.classrooms.find((item) => String(item.id) === String(classroomId));
      const status = app.getRoomStatus(room, reservation);
      const item = document.createElement("span");

      item.className = `period-chip ${status}`;
      if (period.value === selectedPeriod) item.classList.add("active");
      item.textContent = `${period.label} ${getShortStatusLabel(status)}`;
      summary.append(item);
    });

    return summary;
  }

  // 교실 원본 상태 코드를 사용자용 문구로 바꾼다.
  function getClassroomStatusLabel(status) {
    return {
      USE: "사용 중",
      ONE: "일부 사용",
      EMPTY: "비어 있음",
    }[status];
  }

  // 카드 상단 배지에 들어갈 긴 상태 문구를 반환한다.
  function getStatusLabel(status) {
    return {
      available: "사용 가능",
      pending: "승인 대기",
      using: "사용 중",
      unavailable: "사용 중",
    }[status];
  }

  // 교시 칩에 들어갈 짧은 상태 문구를 반환한다.
  function getShortStatusLabel(status) {
    return {
      available: "가능",
      pending: "대기",
      using: "사용",
      unavailable: "사용",
    }[status];
  }

  // 카드 상세 영역에 보여줄 상태 설명을 만든다.
  function getStatusDescription(status, reservation) {
    if (status === "unavailable") return "현재 교실이 사용 중입니다";
    if (status === "pending") return `${reservation.name}님 승인 대기`;
    if (status === "using") return `${reservation.name}님 사용 승인`;
    return "예약할 수 있습니다";
  }

  // 예약 모달 하단의 안내/오류 메시지를 갱신한다.
  function setMessage(message, isError = false) {
    if (!formMessage) return;
    formMessage.textContent = message;
    formMessage.style.color = isError ? "var(--red)" : "var(--green)";
  }
})();
