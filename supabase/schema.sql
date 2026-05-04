-- 이 SQL을 Supabase 대시보드 > SQL Editor 에서 실행하세요

CREATE TABLE IF NOT EXISTS public.events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  member      TEXT        NOT NULL,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ,
  all_day     BOOLEAN     NOT NULL DEFAULT FALSE,
  notify      BOOLEAN     NOT NULL DEFAULT TRUE,
  notified    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint     TEXT        NOT NULL UNIQUE,
  subscription JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS 활성화 (인증 없이 가족 전원 읽기/쓰기 허용)
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all" ON public.events
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "public_all" ON public.push_subscriptions
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;

-- 기념일 테이블
CREATE TABLE IF NOT EXISTS public.anniversaries (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT  NOT NULL,
  month      INT   NOT NULL CHECK (month BETWEEN 1 AND 12),
  day        INT   NOT NULL CHECK (day BETWEEN 1 AND 31),
  emoji      TEXT  NOT NULL DEFAULT '🎉',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.anniversaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all" ON public.anniversaries
  FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.anniversaries;
