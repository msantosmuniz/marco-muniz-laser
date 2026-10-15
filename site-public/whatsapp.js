export const whatsappNumber = '5513997505099';
export const treatments = [
  {
    slug: 'remocao-de-tatuagem',
    name: 'Remoção de tatuagem',
    message: 'Olá, Marco Muniz Laser! Gostaria de informações sobre remoção de tatuagem em Santos.',
  },
  {
    slug: 'remocao-de-micropigmentacao',
    name: 'Remoção de micropigmentação',
    message:
      'Olá, Marco Muniz Laser! Gostaria de informações sobre remoção de micropigmentação em Santos.',
  },
  {
    slug: 'onicomicose',
    name: 'Tratamento de onicomicose',
    message:
      'Olá, Marco Muniz Laser! Gostaria de informações sobre tratamento de onicomicose em Santos.',
  },
];
export function whatsappLink(message) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}
