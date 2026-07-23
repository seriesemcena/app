import type { Metadata } from 'next';
import { DocTitle, H2, P, UL, Mail, Link } from '../_doc';

export const metadata: Metadata = {
  title: 'Termos de Uso — Maratonou',
  description: 'Regras de uso do aplicativo e da comunidade Maratonou.',
};

const SUPPORT = 'suporte@maratonou.com';

export default function TermsPage() {
  return (
    <main>
      <DocTitle updated="23 de julho de 2026">Termos de Uso</DocTitle>

      <P>Bem-vindo ao Maratonou. Ao usar o aplicativo ou o site <b>maratonou.com</b>, você
        concorda com estes Termos. Se não concordar, não utilize o serviço.</P>

      <H2>O que é o Maratonou</H2>
      <P>O Maratonou é um app para acompanhar filmes e séries, organizar listas, avaliar
        títulos e interagir com outros usuários por meio de comentários, avaliações e da
        comunidade. Dados de catálogo são fornecidos pela API do TMDB.</P>

      <H2>Sua conta</H2>
      <UL items={[
        'Você é responsável por manter a segurança das suas credenciais.',
        'As informações de cadastro devem ser verdadeiras e atualizadas.',
        'Você deve ter idade mínima para consentir com o uso, conforme a legislação local.',
      ]} />

      <H2>Conteúdo gerado por usuários</H2>
      <P>Você é o único responsável pelo conteúdo que publica (comentários, avaliações,
        imagens e GIFs). Ao publicar, você concede ao Maratonou uma licença para exibir esse
        conteúdo dentro do serviço. Você mantém a titularidade do que cria.</P>
      <P>É <b>proibido</b> publicar conteúdo que:</P>
      <UL items={[
        'Seja ilegal, ofensivo, difamatório, de ódio, assédio ou ameaça.',
        'Contenha spam, fraude ou links maliciosos.',
        'Viole direitos autorais ou de terceiros.',
        'Contenha spoilers sem o devido aviso, quando aplicável.',
        'Seja conteúdo sexual explícito ou inadequado.',
      ]} />

      <H2>Moderação, denúncia e bloqueio</H2>
      <P>Mantemos <b>tolerância zero para conteúdo abusivo</b>. Qualquer usuário pode
        denunciar comentários e perfis diretamente no app. Nossa equipe analisa as denúncias
        e pode remover conteúdo, aplicar advertências ou suspender contas que violem estes
        Termos. Você também pode excluir o seu próprio conteúdo a qualquer momento.</P>

      <H2>Recursos PRO</H2>
      <P>Alguns recursos podem ser identificados como PRO. No momento, o acesso PRO não é
        vendido dentro do aplicativo e pode ser concedido conforme critérios do Maratonou.
        Caso venha a existir venda de recursos digitais, ela seguirá os mecanismos oficiais
        de compra das lojas.</P>

      <H2>Uso aceitável</H2>
      <P>Você concorda em não tentar burlar mecanismos de segurança, sobrecarregar o serviço,
        coletar dados de outros usuários sem autorização ou usar o app para fins ilícitos.</P>

      <H2>Encerramento</H2>
      <P>Você pode encerrar sua conta a qualquer momento em <b>Configurações &rarr; Excluir
        conta</b>. Podemos suspender ou encerrar contas que violem estes Termos.</P>

      <H2>Isenções e limitação de responsabilidade</H2>
      <P>O serviço é fornecido &ldquo;como está&rdquo;. Não garantimos disponibilidade
        ininterrupta nem a exatidão dos dados de catálogo fornecidos por terceiros.</P>

      <H2>Alterações</H2>
      <P>Podemos atualizar estes Termos. O uso contínuo após alterações representa
        concordância com a versão vigente.</P>

      <H2>Contato</H2>
      <P>Dúvidas: <Mail addr={SUPPORT} />. Comunidade:{' '}
        <Link href="https://community.maratonou.com">community.maratonou.com</Link>. Consulte
        também nossa <Link href="/legal/privacy">Política de Privacidade</Link>.</P>
    </main>
  );
}
