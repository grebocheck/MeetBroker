alter table rooms
  add column image_url varchar(255);

update rooms
set image_url = case name
  when 'Гагарін' then '/rooms/gagarin.webp'
  when 'Акваріум' then '/rooms/aquarium.webp'
  when 'Дніпро' then '/rooms/dnipro.webp'
  when 'Марс' then '/rooms/mars.webp'
  when 'Софія' then '/rooms/sofia.webp'
  else null
end
where name in ('Гагарін', 'Акваріум', 'Дніпро', 'Марс', 'Софія');
