CREATE TABLESPACE nvme_fast_storage LOCATION '/var/lib/postgresql/nvme';
CREATE TABLESPACE sata_cold_storage LOCATION '/var/lib/postgresql/sata';

SET default_tablespace = nvme_fast_storage;

CREATE TABLE sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    max_capacity INT NOT NULL CHECK (max_capacity > 0),
    min_coach_qualification VARCHAR(50) DEFAULT 'Первая',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE coaches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    specialization VARCHAR(100) NOT NULL,
    qualification VARCHAR(50) NOT NULL CHECK (qualification IN ('Высшая', 'Первая', 'Вторая', 'Без категории')),
    monthly_hours_limit INT DEFAULT 160 CHECK (monthly_hours_limit > 0),
    current_load DECIMAL(5,2) DEFAULT 0 CHECK (current_load >= 0 AND current_load <= 100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE halls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    capacity INT NOT NULL CHECK (capacity > 0),
    is_available BOOLEAN DEFAULT TRUE
);

CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) UNIQUE CHECK (phone ~ '^\+7[0-9]{10}$'),
    email VARCHAR(100),
    registration_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE passes (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id),
    pass_type VARCHAR(50) NOT NULL CHECK (pass_type IN ('1 месяц', '3 месяца', '6 месяцев', '12 месяцев')),
    valid_from DATE NOT NULL,
    valid_to DATE NOT NULL,
    visits_total INT NOT NULL CHECK (visits_total > 0),
    visits_remaining INT NOT NULL CHECK (visits_remaining >= 0),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'EXPIRED', 'CANCELLED')),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (id, valid_from)
) PARTITION BY RANGE (valid_from);

CREATE TABLE passes_2026_05 PARTITION OF passes
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01')
    TABLESPACE sata_cold_storage;

CREATE TABLE passes_2026_06 PARTITION OF passes
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01')
    TABLESPACE nvme_fast_storage;

CREATE TABLE passes_2026_07 PARTITION OF passes
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01')
    TABLESPACE nvme_fast_storage;

CREATE TABLE trainings (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    training_date DATE NOT NULL,
    training_time TIME NOT NULL,
    section_id UUID NOT NULL REFERENCES sections(id),
    hall_id UUID NOT NULL REFERENCES halls(id),
    coach_id UUID NOT NULL REFERENCES coaches(id),
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'PUBLISHED', 'CANCELLED')),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (id, training_date)
) PARTITION BY RANGE (training_date);

CREATE TABLE trainings_2026_05 PARTITION OF trainings
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01')
    TABLESPACE sata_cold_storage;

CREATE TABLE trainings_2026_06 PARTITION OF trainings
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01')
    TABLESPACE nvme_fast_storage;

CREATE TABLE trainings_2026_07 PARTITION OF trainings
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01')
    TABLESPACE nvme_fast_storage;

CREATE TABLE coach_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coach_id UUID NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
    training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
    assignment_date DATE NOT NULL,
    hours DECIMAL(4,2) NOT NULL CHECK (hours > 0),
    UNIQUE (coach_id, training_id)
);

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(30) NOT NULL CHECK (report_type IN ('FINANCIAL_FNS', 'STAT_ROSSTAT', 'INTERNAL')),
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES coaches(id),
    status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'GENERATED', 'SENT')),
    total_revenue DECIMAL(12,2),
    vat_amount DECIMAL(12,2),
    total_visits INT,
    avg_load DECIMAL(5,2),
    xml_data TEXT,
    CHECK (
        (report_type = 'FINANCIAL_FNS' AND total_revenue IS NOT NULL AND vat_amount IS NOT NULL) OR
        (report_type = 'STAT_ROSSTAT' AND total_visits IS NOT NULL AND avg_load IS NOT NULL) OR
        (report_type = 'INTERNAL')
    )
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    performed_by UUID,
    performed_at TIMESTAMP DEFAULT NOW()
) TABLESPACE nvme_fast_storage;

CREATE INDEX idx_passes_client ON passes(client_id);
CREATE INDEX idx_passes_section ON passes(section_id);
CREATE INDEX idx_passes_status ON passes(status);
CREATE INDEX idx_passes_valid ON passes(valid_from, valid_to);

CREATE INDEX idx_trainings_date ON trainings(training_date);
CREATE INDEX idx_trainings_section ON trainings(section_id);
CREATE INDEX idx_trainings_coach ON trainings(coach_id);
CREATE INDEX idx_trainings_status ON trainings(status);

CREATE INDEX idx_reports_type_period ON reports(report_type, period_from, period_to);
CREATE INDEX idx_audit_log_table ON audit_log(table_name, performed_at);

CREATE OR REPLACE FUNCTION update_coach_load()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE coaches
    SET current_load = (
        SELECT COALESCE(SUM(hours) * 100.0 / NULLIF(monthly_hours_limit, 0), 0)
        FROM coach_assignments ca
        WHERE ca.coach_id = NEW.coach_id
        AND EXTRACT(MONTH FROM ca.assignment_date) = EXTRACT(MONTH FROM NEW.assignment_date)
    )
    WHERE id = NEW.coach_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_coach_load
AFTER INSERT OR UPDATE OR DELETE ON coach_assignments
FOR EACH ROW EXECUTE FUNCTION update_coach_load();

CREATE VIEW v_monthly_schedule AS
SELECT 
    t.training_date,
    t.training_time,
    s.name AS section_name,
    h.name AS hall_name,
    c.full_name AS coach_name,
    t.status
FROM trainings t
JOIN sections s ON t.section_id = s.id
JOIN halls h ON t.hall_id = h.id
JOIN coaches c ON t.coach_id = c.id
WHERE t.status = 'PUBLISHED';

CREATE VIEW v_active_passes AS
SELECT 
    p.id,
    cl.full_name AS client_name,
    s.name AS section_name,
    p.pass_type,
    p.valid_from,
    p.valid_to,
    p.visits_remaining,
    p.status
FROM passes p
JOIN clients cl ON p.client_id = cl.id
JOIN sections s ON p.section_id = s.id
WHERE p.status = 'ACTIVE' AND p.valid_to >= CURRENT_DATE;

INSERT INTO sections (name, description, max_capacity) VALUES
('Плавание', 'Бассейн 25м', 20),
('Фитнес', 'Групповые занятия', 15),
('Теннис', 'Корт', 4),
('Йога', 'Зал для йоги', 12);

INSERT INTO coaches (full_name, specialization, qualification) VALUES
('Иванов А.А.', 'Плавание', 'Высшая'),
('Петрова В.С.', 'Фитнес', 'Первая'),
('Сидоров П.И.', 'Теннис', 'Высшая'),
('Козлова Е.М.', 'Йога', 'Первая');

INSERT INTO halls (name, capacity) VALUES
('Бассейн №1', 20),
('Зал №2', 15),
('Корт №1', 4),
('Зал №3', 12);