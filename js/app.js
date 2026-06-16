const scheduleDraft = [
    { date: '2026-06-10', time: '09:00', section: 'Плавание', hall: 'Бассейн №1', coach: 'Иванов А.А.', status: 'Черновик' },
    { date: '2026-06-10', time: '11:00', section: 'Фитнес', hall: 'Зал №2', coach: 'Петрова В.С.', status: 'Черновик' },
    { date: '2026-06-11', time: '18:00', section: 'Теннис', hall: 'Корт №1', coach: 'Сидоров П.И.', status: 'Черновик' },
    { date: '2026-06-12', time: '19:00', section: 'Йога', hall: 'Зал №3', coach: 'Козлова Е.М.', status: 'Черновик' }
];

const passesData = {
    '2026-05': [
        { id: 'P-05-01', client: 'Сидоров И.И.', section: 'Плавание', type: '3 месяца', from: '2026-05-01', to: '2026-05-31', status: 'Истек' }
    ],
    '2026-06': [
        { id: 'P-06-01', client: 'Смирнов Д.Д.', section: 'Плавание', type: '1 месяц', from: '2026-06-01', to: '2026-06-30', status: 'Активен' },
        { id: 'P-06-02', client: 'Попова Е.В.', section: 'Фитнес', type: '6 месяцев', from: '2026-06-10', to: '2026-12-10', status: 'Активен' },
        { id: 'P-06-03', client: 'Кузнецов А.Б.', section: 'Теннис', type: '1 месяц', from: '2026-06-05', to: '2026-07-05', status: 'Активен' }
    ]
};

const coachesData = [
    { id: 'C-01', name: 'Иванов А.А.', spec: 'Плавание', qual: 'Высшая', hours: 72, load: 85 },
    { id: 'C-02', name: 'Петрова В.С.', spec: 'Фитнес', qual: 'Первая', hours: 64, load: 72 },
    { id: 'C-03', name: 'Сидоров П.И.', spec: 'Теннис', qual: 'Высшая', hours: 48, load: 58 },
    { id: 'C-04', name: 'Козлова Е.М.', spec: 'Йога', qual: 'Первая', hours: 56, load: 91 }
];

function showSection(sectionId, btnElement) {
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById(sectionId).classList.add('active');
    if (btnElement) btnElement.classList.add('active');

    const titles = {
        'dashboard': 'Обзор системы',
        'schedule': 'Планирование тренировок',
        'passes': 'Управление абонементами',
        'coaches': 'Распределение тренеров',
        'reports': 'Формирование отчетности',
        'database': 'Проектирование структуры БД'
    };
    document.getElementById('page-title').innerText = titles[sectionId];

    if (sectionId === 'schedule') renderSchedule();
    if (sectionId === 'passes') loadPasses();
    if (sectionId === 'coaches') loadCoaches();
}

function addLog(message) {
    const logContainer = document.getElementById('archLog');
    if (!logContainer) return;
    const time = new Date().toLocaleTimeString('ru-RU');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">[${time}]</span> ${message}`;
    logContainer.prepend(entry);
}

function renderSchedule() {
    const tbody = document.getElementById('scheduleTable');
    if (!tbody) return;
    tbody.innerHTML = '';
    scheduleDraft.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.date}</td>
            <td>${item.time}</td>
            <td>${item.section}</td>
            <td>${item.hall}</td>
            <td>${item.coach}</td>
            <td><span class="badge badge-draft">${item.status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function loadDraft() {
    addLog('Redis: Загрузка черновика расписания из кэша...');
    setTimeout(() => {
        renderSchedule();
        addLog('Redis: Черновик загружен. Записей: ' + scheduleDraft.length);
    }, 500);
}

function publishSchedule() {
    const btn = document.getElementById('publishBtn');
    if (!btn) return;
    btn.disabled = true;
    btn.innerText = '⏳ Публикация...';
    addLog('API: Запрос на запись в таблицу `trainings` (NVMe).');

    setTimeout(() => {
        scheduleDraft.forEach(item => item.status = 'Опубликовано');
        renderSchedule();
        document.querySelectorAll('.badge-draft').forEach(badge => {
            badge.className = 'badge badge-published';
            badge.innerText = 'Опубликовано';
        });
        btn.innerText = '✅ Опубликовано';
        addLog('DB: Транзакция зафиксирована (COMMIT). Экстент: trainings_2026_06.');
    }, 1200);
}

function loadPasses() {
    const month = document.getElementById('monthSelect').value;
    const tbody = document.getElementById('passesTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Запрос к БД...</td></tr>';

    setTimeout(() => {
        tbody.innerHTML = '';
        const data = passesData[month] || [];

        if (month === '2026-05') {
            addLog(`DB Engine: SELECT * FROM passes_2026_05 (TABLESPACE: sata_cold_storage)`);
        } else {
            addLog(`DB Engine: SELECT * FROM passes_2026_06 (TABLESPACE: nvme_fast_storage)`);
        }

        data.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.id}</td>
                <td>${item.client}</td>
                <td>${item.section}</td>
                <td>${item.type}</td>
                <td>${item.from}</td>
                <td>${item.to}</td>
                <td><span class="badge badge-${item.status === 'Активен' ? 'active' : 'expired'}">${item.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }, 500);
}

function loadCoaches() {
    const tbody = document.getElementById('coachesTable');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Пересчет нагрузки...</td></tr>';

    addLog('Planner: Анализ загрузки тренеров...');

    setTimeout(() => {
        tbody.innerHTML = '';
        coachesData.forEach(item => {
            const tr = document.createElement('tr');
            const loadClass = item.load > 85 ? 'high' : item.load > 70 ? 'medium' : 'low';
            tr.innerHTML = `
                <td>${item.id}</td>
                <td>${item.name}</td>
                <td>${item.spec}</td>
                <td>${item.qual}</td>
                <td>${item.hours}</td>
                <td>
                    <div class="load-bar">
                        <div class="load-fill ${loadClass}" style="width: ${item.load}%"></div>
                    </div>
                    <span class="load-value">${item.load}%</span>
                </td>
            `;
            tbody.appendChild(tr);
        });
        addLog('Planner: Нагрузка пересчитана. Тренеров: ' + coachesData.length);
    }, 800);
}

function generateReport(agency) {
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('reportStatus');

    if (!progressContainer || !progressBar || !statusText) return;

    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    statusText.innerText = `Подключение к READ-ONLY реплике...`;
    statusText.style.color = 'var(--text)';

    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        progressBar.style.width = progress + '%';
        if (progress === 40) {
            statusText.innerText = 'Агрегация данных из таблиц passes и trainings...';
            addLog(`DB Replica: Выполнение JOIN-запроса к реплике.`);
        }
        if (progress === 70) {
            statusText.innerText = 'Формирование документа...';
            addLog(`Report Service: Генерация XML для ${agency}.`);
        }
        if (progress >= 100) {
            clearInterval(interval);
            statusText.innerText = `✅ Отчет для ${agency} сформирован!`;
            statusText.style.color = 'var(--success)';
            addLog(`System: Задача завершена. Соединение с репликой закрыто.`);
        }
    }, 250);
}

function simulateDbInit() {
    addLog('DB Admin: Запуск скрипта инициализации схемы БД...');
    const statusBox = document.getElementById('dbInitStatus');
    const sqlCode = document.getElementById('sqlCode');

    if (sqlCode) {
        sqlCode.style.opacity = '0.5';
        setTimeout(() => { sqlCode.style.opacity = '1'; }, 300);
    }

    addLog('DB Admin: Создание TABLESPACE nvme_fast_storage... OK');
    setTimeout(() => { addLog('DB Admin: Создание TABLESPACE sata_cold_storage... OK'); }, 400);
    setTimeout(() => { addLog('DB Admin: Создание секционированных таблиц... OK'); }, 800);
    setTimeout(() => {
        addLog('DB Admin: Маппинг полей прототипа в колонки БД завершен.');
        if (statusBox) statusBox.style.display = 'block';
    }, 1200);
}

document.addEventListener('DOMContentLoaded', () => {
    addLog('System: Прототип ИС «Спортивный комплекс» запущен.');
    addLog('Network: Подключение к API Gateway установлено.');
});

function toggleView(view) {
    const schemaView = document.getElementById('schemaView');
    const sqlView = document.getElementById('sqlView');

    if (view === 'schema') {
        schemaView.style.display = 'block';
        sqlView.style.display = 'none';
    } else {
        schemaView.style.display = 'none';
        sqlView.style.display = 'block';
    }
}

function simulateDbInit() {
    addLog('DB Admin: Запуск скрипта инициализации...');
    const statusBox = document.getElementById('dbInitStatus');

    const steps = [
        { msg: 'DB Admin: Создание TABLESPACE nvme_fast_storage... OK', delay: 200 },
        { msg: 'DB Admin: Создание TABLESPACE sata_cold_storage... OK', delay: 400 },
        { msg: 'DB Admin: Создание справочников (sections, coaches, halls, clients)... OK', delay: 700 },
        { msg: 'DB Admin: Создание PARTITIONED TABLE passes... OK', delay: 1000 },
        { msg: 'DB Admin: Создание PARTITIONED TABLE trainings... OK', delay: 1300 },
        { msg: 'DB Admin: Создание партиций за май/июнь/июль 2026... OK', delay: 1600 },
        { msg: 'DB Admin: Создание таблицы coach_assignments... OK', delay: 1800 },
        { msg: 'DB Admin: Создание таблицы reports (иерархия)... OK', delay: 2000 },
        { msg: 'DB Admin: Создание индексов... OK', delay: 2200 },
        { msg: 'DB Admin: Установка триггера trg_update_coach_load... OK', delay: 2400 },
        { msg: 'DB Admin: Создание VIEW v_monthly_schedule, v_active_passes... OK', delay: 2600 },
        { msg: 'DB Admin: Загрузка начальных данных... OK', delay: 2800 }
    ];

    steps.forEach(step => {
        setTimeout(() => addLog(step.msg), step.delay);
    });

    setTimeout(() => {
        addLog('✅ БД успешно развернута. Готово к работе.');
        if (statusBox) statusBox.style.display = 'block';
    }, 3100);
}