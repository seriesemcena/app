import type { Metadata } from 'next';
import { DocTitle, H2, P, UL, Mail, Link } from '../_doc';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Maratonou',
  description: 'Como o Maratonou coleta, usa, armazena e protege seus dados.',
};

const SUPPORT = 'suporte@maratonou.com';

export default function PrivacyPage() {
  return (
    <main>
      <DocTitle updated="23 de julho de 2026">Política de Privacidade</DocTitle>

      <P>Esta política descreve como o Maratonou (&ldquo;nós&rdquo;) coleta, usa e protege
        as informações de quem utiliza o aplicativo e o site <b>maratonou.com</b>. Ao
        criar uma conta ou usar o Maratonou, você concorda com as práticas aqui descritas.</P>

      <H2>Dados que coletamos</H2>
      <UL items={[
        <><b>Cadastro e autenticação:</b> e-mail e, quando você usa login social, o identificador da conta Google ou Apple. A autenticação é feita pelo Firebase Authentication.</>,
        <><b>Perfil:</b> nome de exibição, nome de usuário, foto/avatar, biografia e preferências que você define.</>,
        <><b>Conteúdo que você cria:</b> comentários, avaliações, respostas, listas, imagens e GIFs que você publica.</>,
        <><b>Notificações:</b> um token de dispositivo (Firebase Cloud Messaging) para enviar notificações push, quando você autoriza.</>,
        <><b>Uso do app:</b> informações técnicas necessárias ao funcionamento, como idioma, região e itens salvos nas suas listas.</>,
      ]} />

      <H2>Como usamos os dados</H2>
      <UL items={[
        'Criar e manter sua conta e seu perfil público.',
        'Exibir e sincronizar seu conteúdo, listas e atividades entre dispositivos.',
        'Enviar notificações que você habilitou (estreias, respostas, novos episódios, lembretes).',
        'Moderar conteúdo, responder denúncias e manter a comunidade segura.',
        'Cumprir obrigações legais e prevenir abuso, spam e fraude.',
      ]} />
      <P>Não vendemos seus dados e não os usamos para rastreamento publicitário entre apps ou sites.</P>

      <H2>Serviços de terceiros</H2>
      <P>Para funcionar, o Maratonou utiliza os seguintes serviços, que processam dados
        conforme suas próprias políticas:</P>
      <UL items={[
        <><b>Google Firebase</b> (autenticação, banco de dados, notificações push e funções de servidor).</>,
        <><b>TMDB</b> — dados de filmes e séries. Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</>,
        <><b>Giphy</b> — busca de GIFs usados em comentários.</>,
        <><b>Apple</b> e <b>Google</b> — quando você opta pelo login social correspondente.</>,
      ]} />

      <H2>Armazenamento e retenção</H2>
      <P>Seus dados ficam armazenados na infraestrutura do Google Firebase. Mantemos suas
        informações enquanto sua conta existir. Quando você exclui a conta, removemos os
        dados associados conforme descrito abaixo.</P>

      <H2>Seus direitos e exclusão de conta</H2>
      <P>Você pode, a qualquer momento, editar seu perfil, excluir o conteúdo que publicou e
        <b> excluir permanentemente sua conta</b> diretamente no aplicativo, em
        <b> Configurações &rarr; Excluir conta</b>. A exclusão remove sua conta de
        autenticação e os dados de perfil associados. Você também pode solicitar a exclusão
        pela página <Link href="/legal/delete-account">de solicitação de exclusão</Link> ou
        escrevendo para <Mail addr={SUPPORT} />.</P>

      <H2>Menores de idade</H2>
      <P>O Maratonou não se destina a crianças e não coleta intencionalmente dados de menores
        de 13 anos. Se identificarmos uma conta nessas condições, ela será removida.</P>

      <H2>Segurança</H2>
      <P>Adotamos medidas técnicas para proteger seus dados, incluindo regras de acesso no
        servidor e transmissão criptografada. Nenhum sistema é totalmente imune a riscos,
        mas trabalhamos para reduzi-los continuamente.</P>

      <H2>Alterações nesta política</H2>
      <P>Podemos atualizar esta política periodicamente. Mudanças relevantes serão comunicadas
        no app ou no site, e a data de atualização acima será revisada.</P>

      <H2>Contato</H2>
      <P>Dúvidas sobre privacidade: <Mail addr={SUPPORT} />. Suporte e comunidade:{' '}
        <Link href="https://community.maratonou.com">community.maratonou.com</Link>.</P>
    </main>
  );
}
