-- Añade el tamaño del archivo para poder estimar el espacio usado por las fotos.
alter table content_photos add column if not exists size_bytes bigint default 0;
