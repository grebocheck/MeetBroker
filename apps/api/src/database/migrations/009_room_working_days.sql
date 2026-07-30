alter table rooms
  add column working_days smallint[] not null default array[1, 2, 3, 4, 5]::smallint[];

alter table rooms
  add constraint rooms_working_days_not_empty
    check (cardinality(working_days) between 1 and 7),
  add constraint rooms_working_days_valid
    check (working_days <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]);
