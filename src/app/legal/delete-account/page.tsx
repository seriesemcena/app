import type { Metadata } from 'next';
import { DocTitle, H2, P, UL, Mail, Link } from '../_doc';

export const metadata: Metadata = {
  title: 'Excluir conta e dados — Maratonou',
  description: 'Como solicitar a exclusão da sua conta Maratonou e dos dados associados.',
};

const SUPPORT = 'suporte@maratonou.com';

/* Public account-deletion page. Google Play requires an externally reachable
   URL describing how to delete the account and associated data, in addition
   to the in-app flow (Configurações → Excluir conta). */
export default function DeleteAccountInfoPage() {
  return (
    <main>
      <DocTitle updated="23 de julho de 2026">Excluir conta e dados</DocTitle>

      <P>Esta página explica como excluir sua conta do <b>Maratonou</b> (aplicativo e site
        maratonou.com) e quais dados são removidos.</P>

      <H2>Excluir diretamente no aplicativo</H2>
      <P>A forma mais rápida é pelo próprio app:</P>
      <UL items={[
        'Abra o Maratonou e faça login.',
        'Vá em Configurações.',
        'Toque em “Excluir conta”.',
        'Confirme a operação (pode ser solicitada sua senha por segurança).',
      ]} />
      <P>A exclusão é <b>permanente</b> e não pode ser desfeita.</P>

      <H2>Solicitar exclusão sem acesso ao app</H2>
      <P>Se você não conseguir acessar sua conta, envie um e-mail para <Mail addr={SUPPORT} />{' '}
        a partir do endereço cadastrado, com o assunto <b>&ldquo;Excluir minha conta&rdquo;</b>.
        Confirmaremos sua identidade e processaremos a exclusão em até 30 dias.</P>

      <H2>Quais dados são excluídos</H2>
      <UL items={[
        'Sua conta de autenticação (e-mail / login social).',
        'Seu perfil: nome, nome de usuário, avatar, biografia e preferências.',
        'Suas listas, avaliações e atividades.',
        'Seus tokens de notificação push.',
      ]} />

      <H2>Dados que podem ser retidos</H2>
      <P>Podemos reter, por período limitado e quando exigido por lei, registros mínimos
        necessários para segurança, prevenção de fraude ou cumprimento de obrigações legais.
        Comentários públicos podem ser anonimizados em vez de removidos quando fazem parte de
        uma conversa com outros usuários.</P>

      <H2>Contato</H2>
      <P>Dúvidas sobre exclusão de dados: <Mail addr={SUPPORT} />. Veja também nossa{' '}
        <Link href="/legal/privacy">Política de Privacidade</Link>.</P>
    </main>
  );
}
