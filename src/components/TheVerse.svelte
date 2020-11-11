<script>
	import { createEventDispatcher, getContext } from 'svelte'
	import Card from './Card.svelte'

	let { verse, detail } = getContext('currentVerse')
	let emit = createEventDispatcher()

	let exported = false
	let copied = false
	let copyText

	function copyVerse () {
		copyText.select()
		copied = true

		document.execCommand("copy")
		
		setTimeout(function () {
			copied = false
		}, 1000)
	}

	function reloadVerse () {
		emit('shuffle')
	}

	function exportVerse () {
		exported = true
	}
</script>

<section>
	{#if exported}
		<Card on:close={ () => exported = false }/>
	{/if}

	{#if copied}
		<div class="copied animate-up">ثم النــــــسخ</div>
	{/if}

	<div class="control">
		<span style="animation-delay: .3s" on:click={ exportVerse } class="animate-right">
			<img src="core/assets/svg/share.svg" alt="share">
		</span>
		
		<span style="animation-delay: .5s" on:click={ copyVerse } class="animate-right">
			<img src="core/assets/svg/copy.svg" alt="copy">
		</span>

		<span style="animation-delay: .7s" on:click={ reloadVerse } class="animate-right">
			<img src="core/assets/svg/reload.svg" alt="reload">
		</span>
	</div>

	<div class="verse">
		<span class="animate-down" style="animation-delay: 0">بسم الله الرحمــــــــان الرحيــــــــــــــم</span>
		<h1 class="animate-up" style="animation-delay: .2s">{ verse }</h1>
		<hr class="animate-right">
		<h2 class="animate-down" style="animation-delay: .4s">{ detail }</h2>
	</div>

	<input type="text" bind:this={ copyText } value={ verse }/>
</section>

<style>
	section {
		width: 100%;
		direction: rtl;
		display: flex;
		grid-column: 2 span;
		padding-right: clamp(50px, 10%, 100px);
	}

	section .copied {
		font-family: 'Cairo';
		position: absolute;
		top: 20px; left: 50%;
		transform: translateX(-50%);
		background: #fff;
		color: #333;
		padding: 10px 20px;
		border-radius: 40px
	}

	section .control {
		width: 40px;
		display: flex;
		flex-direction: column;
		position: relative;
		z-index: 2
	}

	section .control span {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 35px; height: 35px;
		border-radius: 35px;
		background: #ffff;
		color: #333;
		cursor: pointer;
		font-size: 20px;
		margin-bottom: 20px;
		opacity: 0;
	}

	section .control span img {
		width: 20px; height: 20px;
	}

	section .control span:last-of-type {
		margin-top: auto;
		margin-bottom: 0;
	}

	section .verse {
		flex: 1;
		font-family: 'Cairo';
		margin-right: 40px
	}

	section .verse span {
		display: block;
		font-family: inherit;
		font-size: 20px;
		opacity: 0
	}

	section .verse h1 {
		font-family: inherit;
		font-weight: 400;
		line-height: 1.7;
		font-size: clamp(40px, 5vw, 100px);
		opacity: 0
	}

	section .verse hr {
		width: 100px;
		margin: 60px 0 30px 0;
		height: 3px;
		background: #fff;
	}

	section .verse h2 {
		font-family: inherit;
		font-weight: 200;
		font-size: 20px;
		opacity: 0
	}

	section input {
		height: 0; border: 0;
		position: absolute;
		bottom: 0; left: 0;
	}
</style>