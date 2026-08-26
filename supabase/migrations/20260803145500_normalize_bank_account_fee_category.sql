update public.finance_entry
set category = 'Kontoführungsgebühr'
where category is not null
  and trim(category) <> 'Kontoführungsgebühr'
  and lower(
    regexp_replace(
      replace(
        replace(
          replace(
            replace(trim(category), 'Ü', 'ue'),
            'ü',
            'ue'
          ),
          'Ä',
          'ae'
        ),
        'ä',
        'ae'
      ),
      '[^a-zA-Z0-9]+',
      '',
      'g'
    )
  ) in (
    'kontofuehrungsgebuehr',
    'kontofuehrungsgebuehren',
    'kontofuehrung',
    'kontofuehrungskosten',
    'kontokosten',
    'bankgebuehr',
    'bankgebuehren'
  );
